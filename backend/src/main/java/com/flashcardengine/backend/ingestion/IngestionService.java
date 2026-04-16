package com.flashcardengine.backend.ingestion;

import com.flashcardengine.backend.common.SqlSchema;
import com.flashcardengine.backend.persistence.entity.CardEntity;
import com.flashcardengine.backend.persistence.entity.CardType;
import com.flashcardengine.backend.persistence.entity.CardSm2StateEntity;
import com.flashcardengine.backend.persistence.entity.DeckEntity;
import com.flashcardengine.backend.persistence.repository.CardRepository;
import com.flashcardengine.backend.persistence.repository.CardSm2StateRepository;
import com.flashcardengine.backend.persistence.repository.DeckRepository;
import com.flashcardengine.backend.storage.R2StorageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.InputStream;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

@Service
public class IngestionService {

    private static final Logger log = LoggerFactory.getLogger(IngestionService.class);
    private static final Pattern BROKEN_TEXT_PATTERN = Pattern.compile(
        "(?i)(\\?{2,}|\\b(tbd|n/?a|unknown|null|incomplete|not provided)\\b)"
    );
    private static final Pattern VISUAL_REFERENCE_PATTERN = Pattern.compile(
        "(?i)\\b(fig(?:ure)?\\.?|diagram|image|table|illustration|shown above|see figure)\\b"
    );

    private final R2StorageService r2StorageService;
    private final DeckRepository deckRepository;
    private final CardRepository cardRepository;
    private final CardSm2StateRepository cardSm2StateRepository;
    private final PdfTextExtractor pdfTextExtractor;
    private final ChunkingService chunkingService;
    private final AIExtractionService extractionService;
    private final EmbeddingService embeddingService;
    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;
    private final String cardsTable;
    private final String deckConceptGraphTable;

    public IngestionService(R2StorageService r2StorageService,
                            DeckRepository deckRepository,
                            CardRepository cardRepository,
                            CardSm2StateRepository cardSm2StateRepository,
                            PdfTextExtractor pdfTextExtractor,
                            ChunkingService chunkingService,
                            AIExtractionService extractionService,
                            EmbeddingService embeddingService,
                            JdbcTemplate jdbcTemplate,
                            PlatformTransactionManager transactionManager,
                            @Value("${app.db.schema:flashcard_engine}") String schemaName) {
        this.r2StorageService = r2StorageService;
        this.deckRepository = deckRepository;
        this.cardRepository = cardRepository;
        this.cardSm2StateRepository = cardSm2StateRepository;
        this.pdfTextExtractor = pdfTextExtractor;
        this.chunkingService = chunkingService;
        this.extractionService = extractionService;
        this.embeddingService = embeddingService;
        this.jdbcTemplate = jdbcTemplate;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        SqlSchema schema = SqlSchema.of(schemaName);
        this.cardsTable = schema.table("cards");
        this.deckConceptGraphTable = schema.table("deck_concept_graph");
    }

    public void processUpload(PdfUploadedEvent event) {
        DeckEntity deck = deckRepository.findByIdAndUserId(event.deckId(), event.userId())
            .orElseThrow(() -> new IllegalArgumentException("Deck not found for uploaded file"));

        String extractedText;
        try (InputStream inputStream = r2StorageService.downloadPdf(event.fileKey())) {
            extractedText = pdfTextExtractor.extractText(inputStream);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to read uploaded PDF", ex);
        }

        String sanitizedExtractedText = sanitizeForDatabaseText(extractedText);
        int removedChars = extractedText.length() - sanitizedExtractedText.length();
        if (removedChars > 0) {
            log.info("Removed {} unsafe characters from extracted PDF text for file {}", removedChars, event.fileKey());
        }

        log.info("Extracted {} characters from uploaded PDF {}", sanitizedExtractedText.length(), event.fileKey());

        List<String> chunks = chunkingService.splitByApproxTokens(sanitizedExtractedText, 1000);
        log.info("Created {} ingestion chunks for file {}", chunks.size(), event.fileKey());
        if (chunks.isEmpty()) {
            log.info("No text chunks created for file {}", event.fileKey());
            return;
        }

        transactionTemplate.execute(status -> {
            cardRepository.deleteByDeckIdAndType(deck.getId(), CardType.RELATION);
            return null;
        });

        int cardsCreated = 0;
        int skippedLowQualityCards = 0;
        int skippedDuplicates = 0;
        Set<String> seenCards = new HashSet<>();
        List<GeneratedCardDraft> createdStudyCards = new ArrayList<>();

        for (int chunkIndex = 0; chunkIndex < chunks.size(); chunkIndex++) {
            String chunk = chunks.get(chunkIndex);

            List<GeneratedCardDraft> rawDrafts = new ArrayList<>();
            rawDrafts.addAll(extractionService.extractDefinitions(chunk));
            rawDrafts.addAll(extractionService.extractEdgeCases(chunk));
            rawDrafts.addAll(extractionService.extractWorkedExamples(chunk));

            List<GeneratedCardDraft> drafts = extractionService.refineDrafts(chunk, rawDrafts);

            for (GeneratedCardDraft draft : drafts) {
                String front = sanitizeForDatabaseText(draft.front()).trim();
                String back = sanitizeForDatabaseText(draft.back()).trim();

                if (front.isBlank() || back.isBlank()) {
                    skippedLowQualityCards += 1;
                    continue;
                }

                if (isLowQualityCard(draft.type(), front, back)) {
                    skippedLowQualityCards += 1;
                    continue;
                }

                String fingerprint = buildCardFingerprint(draft.type(), front, back);
                if (!seenCards.add(fingerprint)) {
                    skippedDuplicates += 1;
                    continue;
                }

                CardEntity savedCard = persistCardWithInitialState(deck, draft.type(), front, back);

                try {
                    List<Double> embedding = embeddingService.generateEmbedding(savedCard.getFront() + "\n" + savedCard.getBack());
                    jdbcTemplate.update(
                        "update %s set embedding = ?::vector where id = ?".formatted(cardsTable),
                        embeddingService.toPgVectorLiteral(embedding),
                        savedCard.getId()
                    );
                } catch (Exception ex) {
                    log.warn("Failed to store embedding for card {} in deck {}; continuing without embedding",
                        savedCard.getId(),
                        deck.getId(),
                        ex);
                }

                cardsCreated += 1;

                if (draft.type() != CardType.RELATION) {
                    createdStudyCards.add(new GeneratedCardDraft(draft.type(), front, back));
                }
            }

            log.info(
                "Processed chunk {}/{} for file {}. Cards available so far: {}",
                chunkIndex + 1,
                chunks.size(),
                event.fileKey(),
                cardsCreated
            );
        }

        boolean deckGraphCreated = persistDeckConceptGraph(deck, createdStudyCards);

        log.info(
            "Ingestion finished for file {}. Created {} cards (deck concept graph stored: {}, skipped {} low-quality cards, {} duplicates).",
            event.fileKey(),
            cardsCreated,
            deckGraphCreated,
            skippedLowQualityCards,
            skippedDuplicates
        );
    }

    private boolean persistDeckConceptGraph(DeckEntity deck, List<GeneratedCardDraft> createdStudyCards) {
        if (createdStudyCards == null || createdStudyCards.isEmpty()) {
            return false;
        }

        GeneratedCardDraft conceptGraphDraft = extractionService.buildDeckConceptGraph(createdStudyCards);
        if (conceptGraphDraft == null) {
            return false;
        }

        String graphJson = sanitizeForDatabaseText(conceptGraphDraft.back()).trim();
        if (graphJson.isBlank() || isLowSignalRelationCard(graphJson)) {
            return false;
        }

        int updatedRows = jdbcTemplate.update(
            """
                insert into %s (deck_id, graph_json, created_at, updated_at)
                values (?, ?, now(), now())
                on conflict (deck_id)
                do update set graph_json = excluded.graph_json, updated_at = now()
                """.formatted(deckConceptGraphTable),
            deck.getId(),
            graphJson
        );

        return updatedRows > 0;
    }

    private CardEntity persistCardWithInitialState(DeckEntity deck, CardType type, String front, String back) {
        CardEntity savedCard = transactionTemplate.execute(status -> {
            CardEntity card = new CardEntity();
            card.setDeck(deck);
            card.setType(type);
            card.setFront(front);
            card.setBack(back);

            CardEntity persistedCard = cardRepository.save(card);

            CardSm2StateEntity state = new CardSm2StateEntity();
            state.setCard(persistedCard);
            state.setEasinessFactor(2.5);
            state.setIntervalDays(1);
            state.setRepetitionCount(0);
            state.setNextReviewDate(LocalDate.now());
            state.setAverageGrade(0.0);
            cardSm2StateRepository.save(state);

            return persistedCard;
        });

        if (savedCard == null) {
            throw new IllegalStateException("Failed to persist card and SM-2 state");
        }

        return savedCard;
    }

    private boolean isLowQualityCard(CardType type, String front, String back) {
        String normalizedFront = compactWhitespace(front);
        String normalizedBack = compactWhitespace(back);

        if (normalizedFront.length() < 12 || normalizedBack.length() < 20) {
            return true;
        }

        if (normalizedFront.equalsIgnoreCase(normalizedBack)) {
            return true;
        }

        if (BROKEN_TEXT_PATTERN.matcher(normalizedFront).find() || BROKEN_TEXT_PATTERN.matcher(normalizedBack).find()) {
            return true;
        }

        return type != CardType.RELATION
            && (VISUAL_REFERENCE_PATTERN.matcher(normalizedFront).find()
            || VISUAL_REFERENCE_PATTERN.matcher(normalizedBack).find());
    }

    private boolean isLowSignalRelationCard(String back) {
        if (back == null || back.isBlank()) {
            return true;
        }

        String normalized = back.replaceAll("\\s+", " ");
        String compact = normalized.replace(" ", "").toLowerCase(Locale.ROOT);

        if (compact.contains("\"nodes\":[]") || compact.contains("\"links\":[]")) {
            return true;
        }

        return normalized.contains("\"id\":\"Core Concept\"")
            && normalized.contains("\"id\":\"Related Concept\"")
            && normalized.contains("\"label\":\"influences\"");
    }

    private String buildCardFingerprint(CardType type, String front, String back) {
        return type.name() + "|" + compactWhitespace(front).toLowerCase(Locale.ROOT) + "|" + compactWhitespace(back).toLowerCase(Locale.ROOT);
    }

    private String compactWhitespace(String value) {
        if (value == null) {
            return "";
        }
        return value.replaceAll("\\s+", " ").trim();
    }

    private String sanitizeForDatabaseText(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }

        StringBuilder sanitized = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); ) {
            int codePoint = value.codePointAt(i);
            i += Character.charCount(codePoint);

            if (codePoint == 0) {
                continue;
            }

            if (codePoint >= 0xD800 && codePoint <= 0xDFFF) {
                continue;
            }

            if (Character.isISOControl(codePoint)
                && codePoint != '\n'
                && codePoint != '\r'
                && codePoint != '\t') {
                continue;
            }

            sanitized.appendCodePoint(codePoint);
        }

        return sanitized.toString();
    }
}
