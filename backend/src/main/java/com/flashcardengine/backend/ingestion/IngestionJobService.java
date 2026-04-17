package com.flashcardengine.backend.ingestion;

import com.flashcardengine.backend.common.SqlSchema;
import com.flashcardengine.backend.ingestion.dto.IngestionJobStatusResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
public class IngestionJobService {

    private static final String STATUS_QUEUED = "QUEUED";
    private static final String STATUS_PROCESSING = "PROCESSING";
    private static final String STATUS_COMPLETED = "COMPLETED";
    private static final String STATUS_FAILED = "FAILED";

    private final JdbcTemplate jdbcTemplate;
    private final String ingestionJobsTable;

    public IngestionJobService(JdbcTemplate jdbcTemplate,
                               @Value("${app.db.schema:flashcard_engine}") String schemaName) {
        this.jdbcTemplate = jdbcTemplate;
        SqlSchema schema = SqlSchema.of(schemaName);
        this.ingestionJobsTable = schema.table("ingestion_jobs");
    }

    public UUID createQueuedJob(UUID userId, UUID deckId, String fileKey) {
        UUID jobId = UUID.randomUUID();
        jdbcTemplate.update(
            """
                insert into %s (
                    id,
                    user_id,
                    deck_id,
                    file_key,
                    status,
                    stage,
                    total_chunks,
                    processed_chunks,
                    cards_created,
                    skipped_low_quality_cards,
                    skipped_duplicates,
                    created_at,
                    updated_at
                )
                values (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, now(), now())
                """.formatted(ingestionJobsTable),
            jobId,
            userId,
            deckId,
            fileKey,
            STATUS_QUEUED,
            "queued"
        );
        return jobId;
    }

    public void markProcessing(UUID jobId, String stage) {
        if (jobId == null) {
            return;
        }

        jdbcTemplate.update(
            """
                update %s
                set status = ?,
                    stage = ?,
                    started_at = coalesce(started_at, now()),
                    updated_at = now()
                where id = ?
                """.formatted(ingestionJobsTable),
            STATUS_PROCESSING,
            normalizeStage(stage),
            jobId
        );
    }

    public void updateProgress(UUID jobId,
                               String stage,
                               int totalChunks,
                               int processedChunks,
                               int cardsCreated,
                               int skippedLowQualityCards,
                               int skippedDuplicates) {
        if (jobId == null) {
            return;
        }

        int safeTotal = Math.max(0, totalChunks);
        int safeProcessed = Math.max(0, processedChunks);
        int clampedProcessed = safeTotal == 0 ? safeProcessed : Math.min(safeProcessed, safeTotal);

        jdbcTemplate.update(
            """
                update %s
                set stage = ?,
                    total_chunks = ?,
                    processed_chunks = ?,
                    cards_created = ?,
                    skipped_low_quality_cards = ?,
                    skipped_duplicates = ?,
                    updated_at = now()
                where id = ?
                """.formatted(ingestionJobsTable),
            normalizeStage(stage),
            safeTotal,
            clampedProcessed,
            Math.max(0, cardsCreated),
            Math.max(0, skippedLowQualityCards),
            Math.max(0, skippedDuplicates),
            jobId
        );
    }

    public void markCompleted(UUID jobId,
                              String stage,
                              int totalChunks,
                              int processedChunks,
                              int cardsCreated,
                              int skippedLowQualityCards,
                              int skippedDuplicates) {
        if (jobId == null) {
            return;
        }

        int safeTotal = Math.max(0, totalChunks);
        int safeProcessed = Math.max(0, processedChunks);
        int clampedProcessed = safeTotal == 0 ? safeProcessed : Math.min(safeProcessed, safeTotal);

        jdbcTemplate.update(
            """
                update %s
                set status = ?,
                    stage = ?,
                    total_chunks = ?,
                    processed_chunks = ?,
                    cards_created = ?,
                    skipped_low_quality_cards = ?,
                    skipped_duplicates = ?,
                    error_message = null,
                    finished_at = now(),
                    updated_at = now()
                where id = ?
                """.formatted(ingestionJobsTable),
            STATUS_COMPLETED,
            normalizeStage(stage),
            safeTotal,
            clampedProcessed,
            Math.max(0, cardsCreated),
            Math.max(0, skippedLowQualityCards),
            Math.max(0, skippedDuplicates),
            jobId
        );
    }

    public void markFailed(UUID jobId, String errorMessage) {
        if (jobId == null) {
            return;
        }

        jdbcTemplate.update(
            """
                update %s
                set status = ?,
                    stage = ?,
                    error_message = ?,
                    finished_at = now(),
                    updated_at = now()
                where id = ?
                """.formatted(ingestionJobsTable),
            STATUS_FAILED,
            "failed",
            truncate(errorMessage, 1200),
            jobId
        );
    }

    public Optional<IngestionJobStatusResponse> getJobForUser(UUID userId, UUID jobId) {
        return jdbcTemplate.query(
            """
                select id,
                       deck_id,
                       file_key,
                       status,
                       stage,
                       total_chunks,
                       processed_chunks,
                       cards_created,
                       skipped_low_quality_cards,
                       skipped_duplicates,
                       error_message,
                       created_at,
                       started_at,
                       finished_at,
                       updated_at
                from %s
                where id = ?
                  and user_id = ?
                """.formatted(ingestionJobsTable),
            rs -> {
                if (!rs.next()) {
                    return Optional.<IngestionJobStatusResponse>empty();
                }

                IngestionJobStatusResponse response = new IngestionJobStatusResponse(
                    rs.getObject("id", UUID.class),
                    rs.getObject("deck_id", UUID.class),
                    rs.getString("file_key"),
                    rs.getString("status"),
                    rs.getString("stage"),
                    rs.getInt("total_chunks"),
                    rs.getInt("processed_chunks"),
                    rs.getInt("cards_created"),
                    rs.getInt("skipped_low_quality_cards"),
                    rs.getInt("skipped_duplicates"),
                    rs.getString("error_message"),
                    toInstant(rs.getTimestamp("created_at")),
                    toInstant(rs.getTimestamp("started_at")),
                    toInstant(rs.getTimestamp("finished_at")),
                    toInstant(rs.getTimestamp("updated_at"))
                );

                return Optional.of(response);
            },
            jobId,
            userId
        );
    }

    private String normalizeStage(String stage) {
        if (stage == null || stage.isBlank()) {
            return "processing";
        }
        return truncate(stage.trim(), 120);
    }

    private String truncate(String value, int maxLength) {
        if (value == null) {
            return null;
        }
        if (value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }

    private Instant toInstant(Timestamp timestamp) {
        if (timestamp == null) {
            return null;
        }
        return timestamp.toInstant();
    }
}