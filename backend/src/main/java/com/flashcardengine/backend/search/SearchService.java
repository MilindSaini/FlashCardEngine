package com.flashcardengine.backend.search;

import com.flashcardengine.backend.common.SqlSchema;
import com.flashcardengine.backend.ingestion.EmbeddingService;
import com.flashcardengine.backend.persistence.entity.CardType;
import com.flashcardengine.backend.search.dto.SearchCardResultResponse;
import com.flashcardengine.backend.search.dto.SearchResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class SearchService {

    private final JdbcTemplate jdbcTemplate;
    private final EmbeddingService embeddingService;
    private final String cardsTable;
    private final String decksTable;

    public SearchService(JdbcTemplate jdbcTemplate,
                         EmbeddingService embeddingService,
                         @Value("${app.db.schema:flashcard_engine}") String schemaName) {
        this.jdbcTemplate = jdbcTemplate;
        this.embeddingService = embeddingService;
        SqlSchema schema = SqlSchema.of(schemaName);
        this.cardsTable = schema.table("cards");
        this.decksTable = schema.table("decks");
    }

    public SearchResponse search(UUID userId, UUID deckId, String mode, String query, int limit) {
        String effectiveMode = mode == null || mode.isBlank() ? "fulltext" : mode.toLowerCase();
        int safeLimit = Math.max(1, Math.min(limit, 50));

        List<SearchCardResultResponse> results = switch (effectiveMode) {
            case "semantic" -> semanticSearch(userId, deckId, query, safeLimit);
            default -> fullTextSearch(userId, deckId, query, safeLimit);
        };

        return new SearchResponse(effectiveMode, query, results);
    }

    private List<SearchCardResultResponse> fullTextSearch(UUID userId, UUID deckId, String query, int limit) {
        if (deckId == null) {
            String sql = """
                select c.id, c.deck_id, c.type, c.front, c.back,
                       ts_rank(c.search_vector, plainto_tsquery('english', ?)) as score
                                from %s c
                                join %s d on d.id = c.deck_id
                where d.user_id = ?
                  and c.search_vector @@ plainto_tsquery('english', ?)
                order by score desc
                limit ?
                                """.formatted(cardsTable, decksTable);

            return jdbcTemplate.query(
                sql,
                (rs, rowNum) -> new SearchCardResultResponse(
                    UUID.fromString(rs.getString("id")),
                    UUID.fromString(rs.getString("deck_id")),
                    CardType.valueOf(rs.getString("type")),
                    rs.getString("front"),
                    rs.getString("back"),
                    rs.getDouble("score")
                ),
                query,
                userId,
                query,
                limit
            );
        }

        String sql = """
            select c.id, c.deck_id, c.type, c.front, c.back,
                   ts_rank(c.search_vector, plainto_tsquery('english', ?)) as score
                        from %s c
                        join %s d on d.id = c.deck_id
            where d.user_id = ?
              and c.deck_id = ?
              and c.search_vector @@ plainto_tsquery('english', ?)
            order by score desc
            limit ?
                        """.formatted(cardsTable, decksTable);

        return jdbcTemplate.query(
            sql,
            (rs, rowNum) -> new SearchCardResultResponse(
                UUID.fromString(rs.getString("id")),
                UUID.fromString(rs.getString("deck_id")),
                CardType.valueOf(rs.getString("type")),
                rs.getString("front"),
                rs.getString("back"),
                rs.getDouble("score")
            ),
            query,
            userId,
            deckId,
            query,
            limit
        );
    }

    private List<SearchCardResultResponse> semanticSearch(UUID userId, UUID deckId, String query, int limit) {
        String vector = embeddingService.toPgVectorLiteral(embeddingService.generateEmbedding(query));

        if (deckId == null) {
            String sql = """
                select c.id, c.deck_id, c.type, c.front, c.back,
                       1 - (c.embedding <=> ?::vector) as score
                                from %s c
                                join %s d on d.id = c.deck_id
                where d.user_id = ?
                  and c.embedding is not null
                order by c.embedding <=> ?::vector asc
                limit ?
                                """.formatted(cardsTable, decksTable);

            return jdbcTemplate.query(
                sql,
                (rs, rowNum) -> new SearchCardResultResponse(
                    UUID.fromString(rs.getString("id")),
                    UUID.fromString(rs.getString("deck_id")),
                    CardType.valueOf(rs.getString("type")),
                    rs.getString("front"),
                    rs.getString("back"),
                    rs.getDouble("score")
                ),
                vector,
                userId,
                vector,
                limit
            );
        }

        String sql = """
            select c.id, c.deck_id, c.type, c.front, c.back,
                   1 - (c.embedding <=> ?::vector) as score
                        from %s c
                        join %s d on d.id = c.deck_id
            where d.user_id = ?
              and c.deck_id = ?
              and c.embedding is not null
            order by c.embedding <=> ?::vector asc
            limit ?
                        """.formatted(cardsTable, decksTable);

        return jdbcTemplate.query(
            sql,
            (rs, rowNum) -> new SearchCardResultResponse(
                UUID.fromString(rs.getString("id")),
                UUID.fromString(rs.getString("deck_id")),
                CardType.valueOf(rs.getString("type")),
                rs.getString("front"),
                rs.getString("back"),
                rs.getDouble("score")
            ),
            vector,
            userId,
            deckId,
            vector,
            limit
        );
    }
}
