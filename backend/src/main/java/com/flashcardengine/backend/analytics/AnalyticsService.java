package com.flashcardengine.backend.analytics;

import com.flashcardengine.backend.analytics.dto.DeckAnalyticsResponse;
import com.flashcardengine.backend.common.SqlSchema;
import com.flashcardengine.backend.deck.DeckService;
import com.flashcardengine.backend.persistence.repository.CardSm2StateRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class AnalyticsService {

    private final DeckService deckService;
    private final CardSm2StateRepository cardSm2StateRepository;
    private final JdbcTemplate jdbcTemplate;
    private final String reviewHistoryTable;
    private final String cardsTable;
    private final String cardSm2StateTable;

    public AnalyticsService(DeckService deckService,
                            CardSm2StateRepository cardSm2StateRepository,
                            JdbcTemplate jdbcTemplate,
                            @Value("${app.db.schema:flashcard_engine}") String schemaName) {
        this.deckService = deckService;
        this.cardSm2StateRepository = cardSm2StateRepository;
        this.jdbcTemplate = jdbcTemplate;
        SqlSchema schema = SqlSchema.of(schemaName);
        this.reviewHistoryTable = schema.table("review_history");
        this.cardsTable = schema.table("cards");
        this.cardSm2StateTable = schema.table("card_sm2_state");
    }

    public DeckAnalyticsResponse deckAnalytics(UUID userId, UUID deckId) {
        deckService.getDeckForUser(deckId, userId);

        long mastered = cardSm2StateRepository.countMasteredByDeckId(deckId);
        long shaky = cardSm2StateRepository.countShakyByDeckId(deckId);
        long due = cardSm2StateRepository.countUpcomingByDeckId(deckId, LocalDate.now());

        return new DeckAnalyticsResponse(
            deckId,
            mastered,
            shaky,
            due,
            buildHeatmap(userId, deckId),
            buildDecayCurve(deckId)
        );
    }

    private List<DeckAnalyticsResponse.HeatmapCell> buildHeatmap(UUID userId, UUID deckId) {
        String sql = """
            select date_trunc('day', rh.reviewed_at)::date as day, count(*) as review_count
                        from %s rh
                        join %s c on c.id = rh.card_id
            where rh.user_id = ?
              and c.deck_id = ?
              and rh.reviewed_at >= now() - interval '90 days'
            group by day
            order by day
                        """.formatted(reviewHistoryTable, cardsTable);

        Map<LocalDate, Long> counts = new HashMap<>();
        jdbcTemplate.query(sql, rs -> {
            LocalDate day = rs.getDate("day").toLocalDate();
            counts.put(day, rs.getLong("review_count"));
        }, userId, deckId);

        LocalDate start = LocalDate.now().minusDays(89);
        List<DeckAnalyticsResponse.HeatmapCell> heatmap = new ArrayList<>();
        for (int i = 0; i < 90; i++) {
            LocalDate day = start.plusDays(i);
            heatmap.add(new DeckAnalyticsResponse.HeatmapCell(day.toString(), counts.getOrDefault(day, 0L)));
        }

        return heatmap;
    }

    private List<DeckAnalyticsResponse.DecayPoint> buildDecayCurve(UUID deckId) {
        String sql = """
            select avg(s.interval_days)::double precision as avg_interval
            from %s s
            join %s c on c.id = s.card_id
            where c.deck_id = ?
            """.formatted(cardSm2StateTable, cardsTable);

        Double avgInterval = jdbcTemplate.queryForObject(sql, Double.class, deckId);
        double stability = (avgInterval == null || avgInterval <= 0) ? 3.0 : avgInterval;

        List<DeckAnalyticsResponse.DecayPoint> points = new ArrayList<>();
        for (int day = 0; day <= 30; day++) {
            double retention = Math.exp(-day / stability);
            points.add(new DeckAnalyticsResponse.DecayPoint(day, retention));
        }

        return points;
    }
}
