package com.flashcardengine.backend.analytics;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashcardengine.backend.analytics.dto.DeckAnalyticsResponse;
import com.flashcardengine.backend.card.Sm2Thresholds;
import com.flashcardengine.backend.common.SqlSchema;
import com.flashcardengine.backend.deck.DeckService;
import com.flashcardengine.backend.persistence.entity.CardType;
import com.flashcardengine.backend.persistence.repository.CardSm2StateRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class AnalyticsService {

    private final DeckService deckService;
    private final CardSm2StateRepository cardSm2StateRepository;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final String cardsTable;
    private final String deckConceptGraphTable;

    public AnalyticsService(DeckService deckService,
                            CardSm2StateRepository cardSm2StateRepository,
                            JdbcTemplate jdbcTemplate,
                            ObjectMapper objectMapper,
                            @Value("${app.db.schema:flashcard_engine}") String schemaName) {
        this.deckService = deckService;
        this.cardSm2StateRepository = cardSm2StateRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        SqlSchema schema = SqlSchema.of(schemaName);
        this.cardsTable = schema.table("cards");
        this.deckConceptGraphTable = schema.table("deck_concept_graph");
    }

    public DeckAnalyticsResponse deckAnalytics(UUID userId, UUID deckId) {
        deckService.getDeckForUser(deckId, userId);

        long mastered = cardSm2StateRepository.countMasteredByDeckId(
            deckId,
            CardType.RELATION,
            Sm2Thresholds.MASTERED_MIN_REPETITIONS,
            Sm2Thresholds.MASTERED_MIN_AVERAGE_GRADE
        );
        long shaky = cardSm2StateRepository.countShakyByDeckId(
            deckId,
            CardType.RELATION,
            Sm2Thresholds.SHAKY_MAX_AVERAGE_GRADE
        );
        long due = cardSm2StateRepository.countUpcomingByDeckId(deckId, LocalDate.now(), CardType.RELATION);

        return new DeckAnalyticsResponse(
            deckId,
            mastered,
            shaky,
            due,
            buildConceptGraph(deckId)
        );
    }

    private DeckAnalyticsResponse.ConceptGraph buildConceptGraph(UUID deckId) {
        Map<String, DeckAnalyticsResponse.ConceptNode> nodes = new LinkedHashMap<>();
        Map<String, DeckAnalyticsResponse.ConceptLink> links = new LinkedHashMap<>();

        String storedGraphSql = """
            select graph_json
            from %s
            where deck_id = ?
            """.formatted(deckConceptGraphTable);

        String storedGraphJson = jdbcTemplate.query(
            storedGraphSql,
            rs -> rs.next() ? rs.getString("graph_json") : null,
            deckId
        );

        boolean mergedStoredGraph = mergeConceptGraphJson(storedGraphJson, nodes, links);
        if (mergedStoredGraph) {
            return new DeckAnalyticsResponse.ConceptGraph(
                new ArrayList<>(nodes.values()),
                new ArrayList<>(links.values())
            );
        }

        String relationCardSql = """
            select c.back
            from %s c
            where c.deck_id = ?
              and c.type = 'RELATION'
                        order by c.created_at desc
            """.formatted(cardsTable);

        jdbcTemplate.query(
            relationCardSql,
            rs -> {
                String relationJson = rs.getString("back");
                mergeConceptGraphJson(relationJson, nodes, links);
            },
            deckId
        );

        return new DeckAnalyticsResponse.ConceptGraph(
            new ArrayList<>(nodes.values()),
            new ArrayList<>(links.values())
        );
    }

    private boolean mergeConceptGraphJson(String graphJson,
                                          Map<String, DeckAnalyticsResponse.ConceptNode> nodes,
                                          Map<String, DeckAnalyticsResponse.ConceptLink> links) {
        if (graphJson == null || graphJson.isBlank()) {
            return false;
        }

        boolean merged = false;
        try {
            JsonNode root = objectMapper.readTree(graphJson);
            JsonNode relationNodes = root.path("nodes");
            if (relationNodes.isArray()) {
                for (JsonNode relationNode : relationNodes) {
                    String id = relationNode.path("id").asText("").trim();
                    if (!id.isBlank() && !nodes.containsKey(id)) {
                        nodes.put(id, new DeckAnalyticsResponse.ConceptNode(id));
                        merged = true;
                    }
                }
            }

            JsonNode relationLinks = root.path("links");
            if (relationLinks.isArray()) {
                for (JsonNode relationLink : relationLinks) {
                    String source = relationLink.path("source").asText("").trim();
                    String target = relationLink.path("target").asText("").trim();
                    String label = relationLink.path("label").asText("").trim();

                    if (source.isBlank() || target.isBlank()) {
                        continue;
                    }

                    if (!nodes.containsKey(source)) {
                        nodes.put(source, new DeckAnalyticsResponse.ConceptNode(source));
                    }
                    if (!nodes.containsKey(target)) {
                        nodes.put(target, new DeckAnalyticsResponse.ConceptNode(target));
                    }

                    String normalizedLabel = label.isBlank() ? "related to" : label;
                    String linkKey = source + "->" + target + "|" + normalizedLabel;
                    if (!links.containsKey(linkKey)) {
                        links.put(
                            linkKey,
                            new DeckAnalyticsResponse.ConceptLink(source, target, normalizedLabel)
                        );
                        merged = true;
                    }
                }
            }
        } catch (Exception ignored) {
            return false;
        }

        return merged;
    }
}
