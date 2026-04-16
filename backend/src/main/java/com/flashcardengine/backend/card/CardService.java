package com.flashcardengine.backend.card;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashcardengine.backend.card.dto.DueCardResponse;
import com.flashcardengine.backend.deck.DeckService;
import com.flashcardengine.backend.persistence.entity.CardEntity;
import com.flashcardengine.backend.persistence.entity.CardType;
import com.flashcardengine.backend.persistence.repository.CardRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Service
public class CardService {

    private final CardRepository cardRepository;
    private final DeckService deckService;
    private final ObjectMapper objectMapper;
    private static final int MAX_FRONT_LENGTH = 120;

    public CardService(CardRepository cardRepository,
                       DeckService deckService,
                       ObjectMapper objectMapper) {
        this.cardRepository = cardRepository;
        this.deckService = deckService;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<DueCardResponse> dueCards(UUID userId, UUID deckId) {
        deckService.getDeckForUser(deckId, userId);

        return cardRepository.findDueCards(deckId, userId, LocalDate.now()).stream()
            .filter(this::isReviewableCard)
            .map(this::toDueCardResponse)
            .toList();
    }

    @Transactional(readOnly = true)
    public List<DueCardResponse> deckCards(UUID userId, UUID deckId) {
        deckService.getDeckForUser(deckId, userId);

        return cardRepository.findDeckCards(deckId, userId).stream()
            .filter(this::isReviewableCard)
            .map(this::toDueCardResponse)
            .toList();
    }

    private boolean isReviewableCard(CardEntity card) {
        if (card.getType() != CardType.RELATION) {
            return true;
        }

        String back = compactWhitespace(card.getBack());
        return !isLowSignalRelationPayload(back);
    }

    private DueCardResponse toDueCardResponse(CardEntity card) {
        String front = normalizeFrontForReview(card.getType(), card.getFront(), card.getBack());
        String back = normalizeBackForReview(card.getType(), card.getBack());
        return new DueCardResponse(card.getId(), card.getType(), front, back);
    }

    private String normalizeFrontForReview(CardType type, String front, String back) {
        String cleanFront = compactWhitespace(front);
        String cleanBack = compactWhitespace(back);

        if (type == CardType.RELATION) {
            String relationFront = relationFrontFromGraph(cleanBack);
            if (!relationFront.isBlank()) {
                return relationFront;
            }
            if (cleanFront.equalsIgnoreCase("Explain the relationships between these concepts")) {
                return "Review how the key concepts connect in this topic.";
            }
        }

        if (type == CardType.DEFINITION && cleanFront.equalsIgnoreCase("Define this concept")) {
            return truncate("Explain this idea: " + cleanBack, MAX_FRONT_LENGTH);
        }

        if (type == CardType.EXAMPLE && cleanFront.equalsIgnoreCase("Work through this example")) {
            return truncate("Work through this example: " + cleanBack, MAX_FRONT_LENGTH);
        }

        if (type == CardType.EDGE_CASE && cleanFront.equalsIgnoreCase("What edge case should you watch for?")) {
            return truncate("What pitfall appears here: " + cleanBack, MAX_FRONT_LENGTH);
        }

        return cleanFront;
    }

    private String normalizeBackForReview(CardType type, String back) {
        String cleanBack = compactWhitespace(back);
        if (type != CardType.RELATION) {
            return cleanBack;
        }

        String summarized = summarizeRelationGraph(cleanBack);
        if (!summarized.isBlank()) {
            return summarized;
        }

        if (isLowSignalRelationPayload(cleanBack) || looksLikeJson(cleanBack)) {
            return "Concept graph details are unavailable for this card. Use Analytics for deck-level relationship insights.";
        }

        return cleanBack;
    }

    private String relationFrontFromGraph(String graphJson) {
        try {
            JsonNode root = objectMapper.readTree(graphJson);
            JsonNode nodes = root.path("nodes");
            if (!nodes.isArray() || nodes.isEmpty()) {
                return "";
            }

            List<String> names = new ArrayList<>();
            for (JsonNode node : nodes) {
                String id = compactWhitespace(node.path("id").asText(""));
                if (!id.isBlank()) {
                    names.add(id);
                }
                if (names.size() >= 3) {
                    break;
                }
            }

            if (names.isEmpty()) {
                return "";
            }

            if (names.size() == 1) {
                return truncate("How is " + names.getFirst() + " connected to other concepts?", MAX_FRONT_LENGTH);
            }

            return truncate("How are " + String.join(", ", names) + " related?", MAX_FRONT_LENGTH);
        } catch (Exception ignored) {
            return "";
        }
    }

    private String summarizeRelationGraph(String graphJson) {
        try {
            JsonNode root = objectMapper.readTree(graphJson);
            JsonNode links = root.path("links");
            if (!links.isArray() || links.isEmpty()) {
                return "";
            }

            List<String> bullets = new ArrayList<>();
            for (JsonNode link : links) {
                String source = compactWhitespace(link.path("source").asText(""));
                String target = compactWhitespace(link.path("target").asText(""));
                String label = compactWhitespace(link.path("label").asText("related to"));
                if (source.isBlank() || target.isBlank()) {
                    continue;
                }
                bullets.add("- " + source + " -> " + target + " (" + label + ")");
                if (bullets.size() >= 5) {
                    break;
                }
            }

            if (bullets.isEmpty()) {
                return "";
            }

            return "Key relationships:\n" + String.join("\n", bullets);
        } catch (Exception ignored) {
            return "";
        }
    }

    private String compactWhitespace(String value) {
        if (value == null) {
            return "";
        }
        return value.replaceAll("\\s+", " ").trim();
    }

    private boolean looksLikeJson(String value) {
        String trimmed = value.trim();
        return trimmed.startsWith("{") && trimmed.endsWith("}");
    }

    private boolean isLowSignalRelationPayload(String value) {
        String compact = value.replace(" ", "").toLowerCase(Locale.ROOT);
        return compact.contains("\"nodes\":[]")
            || compact.contains("\"links\":[]")
            || (compact.contains("\"id\":\"coreconcept\"")
                && compact.contains("\"id\":\"relatedconcept\"")
                && compact.contains("\"label\":\"influences\""));
    }

    private String truncate(String value, int maxLength) {
        if (value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength - 3).trim() + "...";
    }
}
