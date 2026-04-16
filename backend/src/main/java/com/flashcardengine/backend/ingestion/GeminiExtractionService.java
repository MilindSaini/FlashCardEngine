package com.flashcardengine.backend.ingestion;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashcardengine.backend.persistence.entity.CardType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.HttpClientErrorException.BadRequest;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class GeminiExtractionService implements AIExtractionService {

    private static final Logger log = LoggerFactory.getLogger(GeminiExtractionService.class);
    private static final List<String> DEFAULT_MODEL_FALLBACKS = List.of(
        "gemini-3-flash-preview",
        "gemini-3.1-flash-lite-preview",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-1.5-flash-latest"
    );

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final String apiKey;
    private final List<String> modelCandidates;
    private final Set<String> permanentlyUnavailableModels = ConcurrentHashMap.newKeySet();
    private final Map<String, Instant> temporarilyUnavailableModels = new ConcurrentHashMap<>();
    @Value("${app.ai.gemini.enabled:true}")
    private boolean geminiEnabled;
    private volatile String preferredModel;
    private volatile boolean loggedNoWorkingModel;
    private volatile Instant geminiDisabledUntil;
    private volatile boolean loggedGeminiTemporarilyDisabled;
    private static final int GEMINI_CONNECT_TIMEOUT_MS = 5000;
    private static final int GEMINI_READ_TIMEOUT_MS = 12000;
    private static final long TRANSIENT_MODEL_COOLDOWN_SECONDS = 90;
    private static final long GLOBAL_GEMINI_DISABLE_SECONDS = 1800;
    private static final int MAX_FRONT_LENGTH = 120;
    private static final int MAX_BACK_LENGTH = 340;
    private static final int MAX_REFINED_CARDS_PER_CHUNK = 8;
    private static final Pattern DEFINABLE_PHRASE_PATTERN = Pattern.compile(
        "(?i)^\\s*(?:the|a|an)?\\s*([\\p{L}\\p{N}\\- ]{3,80}?)\\s+(?:is|are|means|refers to|denotes)\\b"
    );
    private static final Pattern VISUAL_REFERENCE_PATTERN = Pattern.compile(
        "(?i)\\b(fig(?:ure)?\\.?|diagram|image|table|illustration|shown above|see figure)\\b"
    );
    private static final Pattern PLACEHOLDER_PATTERN = Pattern.compile(
        "(?i)(\\?{2,}|\\b(tbd|n/?a|unknown|null|incomplete|not provided)\\b)"
    );

    public GeminiExtractionService(@Value("${app.ai.gemini.api-key}") String apiKey,
                                   @Value("${app.ai.gemini.model}") String model,
                                   ObjectMapper objectMapper) {
        this.apiKey = apiKey;
        this.modelCandidates = buildModelCandidates(model);
        this.preferredModel = this.modelCandidates.getFirst();
        this.objectMapper = objectMapper;

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(GEMINI_CONNECT_TIMEOUT_MS);
        requestFactory.setReadTimeout(GEMINI_READ_TIMEOUT_MS);

        this.restClient = RestClient.builder()
            .baseUrl("https://generativelanguage.googleapis.com")
            .requestFactory(requestFactory)
            .build();
    }

    @Override
    public List<GeneratedCardDraft> extractDefinitions(String chunk) {
        String prompt = "Extract up to 3 core definitions from the text. " +
            "Return JSON array only: [{\"front\":\"What is <term>?\",\"back\":\"Concise definition\"}]";
        return extractCards(chunk, prompt, CardType.DEFINITION, 3);
    }

    @Override
    public List<GeneratedCardDraft> extractRelationships(String chunk) {
        String prompt = "Build a concept graph from the text. Return ONLY JSON object: " +
            "{\"nodes\":[{\"id\":\"Concept\"}],\"links\":[{\"source\":\"A\",\"target\":\"B\",\"label\":\"relation\"}]}";
        String graphJson = extractRawJson(chunk, prompt);
        return List.of(new GeneratedCardDraft(
            CardType.RELATION,
            "Explain the relationships between these concepts",
            graphJson
        ));
    }

    @Override
    public List<GeneratedCardDraft> extractEdgeCases(String chunk) {
        String prompt = "Extract up to 2 edge cases, pitfalls, or exceptions from the text. " +
            "Return JSON array only: [{\"front\":\"What edge case should you watch for?\",\"back\":\"Short explanation\"}]";
        return extractCards(chunk, prompt, CardType.EDGE_CASE, 2);
    }

    @Override
    public List<GeneratedCardDraft> extractWorkedExamples(String chunk) {
        String prompt = "Extract up to 2 worked examples from the text. " +
            "Return JSON array only: [{\"front\":\"How do you solve this problem?\",\"back\":\"Short step-by-step note\"}]";
        return extractCards(chunk, prompt, CardType.EXAMPLE, 2);
    }

    @Override
    public List<GeneratedCardDraft> refineDrafts(String chunk, List<GeneratedCardDraft> drafts) {
        if (drafts == null || drafts.isEmpty()) {
            return List.of();
        }

        List<GeneratedCardDraft> prepared = new ArrayList<>();
        for (GeneratedCardDraft draft : drafts) {
            if (draft == null || draft.type() == null) {
                continue;
            }

            GeneratedCardDraft normalized = normalizeDraft(draft.type(), draft.front(), draft.back());
            if (normalized == null) {
                continue;
            }

            prepared.add(normalized);
        }

        if (prepared.isEmpty()) {
            return List.of();
        }

        if (apiKey == null || apiKey.isBlank()) {
            return heuristicRefineDrafts(prepared);
        }

        String serializedDrafts = serializeDrafts(prepared);
        if (serializedDrafts.isBlank()) {
            return heuristicRefineDrafts(prepared);
        }

        String instruction = """
            Clean and prioritize these flashcard drafts for revision.
            Return ONLY a JSON array where each object uses this shape:
            {"type":"DEFINITION|RELATION|EDGE_CASE|EXAMPLE|QA","front":"...","back":"..."}
            Rules:
            - Keep only cards that are useful and important for studying.
            - Remove cards that are broken, duplicated, vague, or very low-value.
            - Remove cards that depend on missing visuals (figures, diagrams, tables, images).
            - Repair incomplete questions and answers using the source text.
            - Front must be a complete grammatical study question, <= 120 chars.
            - Back must be a concise short note (1-3 sentences), <= 340 chars.
            - Preserve the card type for kept cards.
            Draft cards JSON:
            %s
            """.formatted(serializedDrafts);

        String raw = extractRawJson(chunk, instruction);
        List<GeneratedCardDraft> refined = parseRefinedDrafts(raw);
        if (refined.isEmpty()) {
            return heuristicRefineDrafts(prepared);
        }

        return refined;
    }

    private List<GeneratedCardDraft> extractCards(String chunk,
                                                  String passInstruction,
                                                  CardType cardType,
                                                  int maxCards) {
        if (chunk == null || chunk.isBlank()) {
            return List.of();
        }

        if (apiKey == null || apiKey.isBlank()) {
            return fallbackCards(chunk, cardType, maxCards);
        }

        String raw = extractRawJson(chunk, passInstruction);

        try {
            String cleaned = cleanJson(raw);
            JsonNode root = objectMapper.readTree(cleaned);
            if (!root.isArray()) {
                return fallbackCards(chunk, cardType, maxCards);
            }

            List<GeneratedCardDraft> drafts = new ArrayList<>();
            for (JsonNode node : root) {
                if (drafts.size() >= maxCards) {
                    break;
                }
                String front = node.path("front").asText("").trim();
                String back = node.path("back").asText("").trim();
                if (!front.isBlank() && !back.isBlank()) {
                    drafts.add(new GeneratedCardDraft(cardType, front, back));
                }
            }

            return drafts.isEmpty() ? fallbackCards(chunk, cardType, maxCards) : drafts;
        } catch (Exception ex) {
            log.warn("Gemini returned malformed JSON for {} pass; using heuristic fallback.", cardType);
            log.debug("Failed to parse Gemini JSON output for {} pass", cardType, ex);
            return fallbackCards(chunk, cardType, maxCards);
        }
    }

    private String extractRawJson(String chunk, String passInstruction) {
        if (!geminiEnabled || apiKey == null || apiKey.isBlank()) {
            return fallbackRelationshipGraph(chunk);
        }

        if (isGeminiTemporarilyDisabled()) {
            return fallbackRelationshipGraph(chunk);
        }

        String prompt = "You are generating high-quality flashcards from source text. " +
            "Respond with JSON only and no markdown fences.\n\nInstruction:\n" +
            passInstruction + "\n\nSource:\n" + chunk;

        Map<String, Object> payload = Map.of(
            "contents", List.of(Map.of("parts", List.of(Map.of("text", prompt)))),
            "generationConfig", Map.of("responseMimeType", "application/json")
        );

        for (String modelName : resolveModelsToTry()) {
            if (permanentlyUnavailableModels.contains(modelName) || isTemporarilyUnavailable(modelName)) {
                continue;
            }

            try {
                String text = invokeModel(payload, modelName);
                if (text.isBlank()) {
                    markTemporarilyUnavailable(modelName);
                    continue;
                }

                preferredModel = modelName;
                loggedNoWorkingModel = false;
                geminiDisabledUntil = null;
                loggedGeminiTemporarilyDisabled = false;
                temporarilyUnavailableModels.remove(modelName);
                return text;
            } catch (HttpClientErrorException.NotFound ex) {
                permanentlyUnavailableModels.add(modelName);
                log.warn("Gemini model '{}' is unavailable (404). Trying fallback model.", modelName);
            } catch (BadRequest ex) {
                permanentlyUnavailableModels.add(modelName);
                log.warn("Gemini model '{}' rejected request (400). Trying fallback model.", modelName);
            } catch (Exception ex) {
                markTemporarilyUnavailable(modelName);
                log.warn(
                    "Gemini call failed for model '{}'; temporarily skipping for {}s and trying fallback model.",
                    modelName,
                    TRANSIENT_MODEL_COOLDOWN_SECONDS,
                    ex
                );
            }
        }

        if (!loggedNoWorkingModel) {
            loggedNoWorkingModel = true;
            log.warn("No working Gemini model available; using fallback extraction");
        }
        disableGeminiTemporarily();
        return fallbackRelationshipGraph(chunk);
    }

    private String invokeModel(Map<String, Object> payload, String modelName) {
        byte[] responseBytes = restClient.post()
            .uri("/v1beta/models/{model}:generateContent?key={key}", modelName, apiKey)
            .contentType(MediaType.APPLICATION_JSON)
            .body(payload)
            .retrieve()
            .body(byte[].class);

        if (responseBytes == null || responseBytes.length == 0) {
            return "";
        }

        String responseBody = new String(responseBytes, StandardCharsets.UTF_8);
        if (responseBody.isBlank()) {
            return "";
        }

        JsonNode response;
        try {
            response = objectMapper.readTree(responseBody);
        } catch (Exception ex) {
            log.warn("Gemini returned a non-JSON response for model '{}'; falling back.", modelName);
            log.debug("Non-JSON Gemini payload for model '{}': {}", modelName, responseBody, ex);
            return "";
        }

        return response.path("candidates")
            .path(0)
            .path("content")
            .path("parts")
            .path(0)
            .path("text")
            .asText("")
            .trim();
    }

    private boolean isTemporarilyUnavailable(String modelName) {
        Instant blockedUntil = temporarilyUnavailableModels.get(modelName);
        if (blockedUntil == null) {
            return false;
        }

        if (Instant.now().isAfter(blockedUntil)) {
            temporarilyUnavailableModels.remove(modelName);
            return false;
        }

        return true;
    }

    private void markTemporarilyUnavailable(String modelName) {
        temporarilyUnavailableModels.put(modelName, Instant.now().plusSeconds(TRANSIENT_MODEL_COOLDOWN_SECONDS));
    }

    private boolean isGeminiTemporarilyDisabled() {
        Instant disabledUntil = geminiDisabledUntil;
        if (disabledUntil == null) {
            return false;
        }

        if (Instant.now().isAfter(disabledUntil)) {
            geminiDisabledUntil = null;
            loggedGeminiTemporarilyDisabled = false;
            return false;
        }

        if (!loggedGeminiTemporarilyDisabled) {
            loggedGeminiTemporarilyDisabled = true;
            log.warn("Gemini is temporarily disabled for {} seconds; using fallback extraction.", GLOBAL_GEMINI_DISABLE_SECONDS);
        }

        return true;
    }

    private void disableGeminiTemporarily() {
        geminiDisabledUntil = Instant.now().plusSeconds(GLOBAL_GEMINI_DISABLE_SECONDS);
        loggedGeminiTemporarilyDisabled = false;
    }

    private List<String> resolveModelsToTry() {
        LinkedHashSet<String> ordered = new LinkedHashSet<>();
        ordered.add(preferredModel);
        ordered.addAll(modelCandidates);
        return List.copyOf(ordered);
    }

    private List<String> buildModelCandidates(String configuredModel) {
        LinkedHashSet<String> ordered = new LinkedHashSet<>();
        if (configuredModel != null && !configuredModel.isBlank()) {
            ordered.add(configuredModel.trim());
        }
        ordered.addAll(DEFAULT_MODEL_FALLBACKS);
        return List.copyOf(ordered);
    }

    private List<GeneratedCardDraft> fallbackCards(String chunk, CardType type, int maxCards) {
        String[] sentences = chunk.split("(?<=[.!?])\\s+");
        List<GeneratedCardDraft> cards = new ArrayList<>();

        for (int i = 0; i < sentences.length && cards.size() < Math.max(1, maxCards); i++) {
            String sentence = normalizeSentence(sentences[i]);
            if (sentence.length() < 30) {
                continue;
            }

            String front;
            switch (type) {
                case DEFINITION -> front = buildDefinitionFront(sentence);
                case EDGE_CASE -> front = buildEdgeCaseFront(sentence);
                case EXAMPLE -> front = buildExampleFront(sentence);
                default -> front = buildGenericFront(sentence);
            }
            cards.add(new GeneratedCardDraft(type, front, sentence));
        }

        if (cards.isEmpty()) {
            String snippet = normalizeSentence(chunk.substring(0, Math.min(400, chunk.length())));
            cards.add(new GeneratedCardDraft(type, fallbackFrontForType(type, snippet), snippet));
        }

        return cards;
    }

    private List<GeneratedCardDraft> parseRefinedDrafts(String raw) {
        try {
            JsonNode root = objectMapper.readTree(cleanJson(raw));
            if (!root.isArray()) {
                return List.of();
            }

            List<GeneratedCardDraft> refined = new ArrayList<>();
            Set<String> seen = new HashSet<>();

            for (JsonNode node : root) {
                if (refined.size() >= MAX_REFINED_CARDS_PER_CHUNK) {
                    break;
                }

                CardType type = parseCardType(node.path("type").asText(""));
                if (type == null) {
                    continue;
                }

                GeneratedCardDraft normalized = normalizeDraft(
                    type,
                    node.path("front").asText(""),
                    node.path("back").asText("")
                );

                if (normalized == null || !isUsefulCard(normalized)) {
                    continue;
                }

                String fingerprint = cardFingerprint(normalized);
                if (!seen.add(fingerprint)) {
                    continue;
                }

                refined.add(normalized);
            }

            return refined;
        } catch (Exception ex) {
            log.debug("Failed to parse refined Gemini card payload; using heuristic refinement.", ex);
            return List.of();
        }
    }

    private List<GeneratedCardDraft> heuristicRefineDrafts(List<GeneratedCardDraft> drafts) {
        List<GeneratedCardDraft> refined = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        for (GeneratedCardDraft draft : drafts) {
            if (refined.size() >= MAX_REFINED_CARDS_PER_CHUNK) {
                break;
            }

            GeneratedCardDraft normalized = normalizeDraft(draft.type(), draft.front(), draft.back());
            if (normalized == null || !isUsefulCard(normalized)) {
                continue;
            }

            String fingerprint = cardFingerprint(normalized);
            if (!seen.add(fingerprint)) {
                continue;
            }

            refined.add(normalized);
        }

        return refined;
    }

    private GeneratedCardDraft normalizeDraft(CardType type, String front, String back) {
        String normalizedFront = compactWhitespace(front);
        String normalizedBack = compactWhitespace(back);

        if (normalizedFront.isBlank() || normalizedBack.isBlank()) {
            return null;
        }

        if (type == CardType.RELATION) {
            return new GeneratedCardDraft(
                type,
                truncate(normalizedFront, MAX_FRONT_LENGTH),
                truncate(normalizedBack, MAX_BACK_LENGTH)
            );
        }

        String polishedFront = ensureQuestionFront(type, normalizedFront);
        String polishedBack = toShortNote(normalizedBack);
        if (polishedFront.isBlank() || polishedBack.isBlank()) {
            return null;
        }

        return new GeneratedCardDraft(type, polishedFront, polishedBack);
    }

    private String ensureQuestionFront(CardType type, String front) {
        String normalized = compactWhitespace(front);
        if (normalized.isBlank()) {
            return "";
        }

        if (normalized.endsWith("?")) {
            return truncate(normalized, MAX_FRONT_LENGTH);
        }

        String lower = normalized.toLowerCase(Locale.ROOT);
        if (lower.startsWith("what ")
            || lower.startsWith("how ")
            || lower.startsWith("why ")
            || lower.startsWith("when ")
            || lower.startsWith("which ")
            || lower.startsWith("where ")
            || lower.startsWith("who ")
            || lower.startsWith("explain ")
            || lower.startsWith("describe ")
            || lower.startsWith("compare ")) {
            return truncate(normalized + "?", MAX_FRONT_LENGTH);
        }

        return switch (type) {
            case DEFINITION -> truncate("What does this concept mean: " + normalized + "?", MAX_FRONT_LENGTH);
            case EDGE_CASE -> truncate("What is the key pitfall here: " + normalized + "?", MAX_FRONT_LENGTH);
            case EXAMPLE -> truncate("How would you solve this: " + normalized + "?", MAX_FRONT_LENGTH);
            default -> truncate(normalized + "?", MAX_FRONT_LENGTH);
        };
    }

    private String toShortNote(String back) {
        String normalized = compactWhitespace(back);
        if (normalized.isBlank()) {
            return "";
        }

        String[] sentences = normalized.split("(?<=[.!?])\\s+");
        StringBuilder shortNote = new StringBuilder();
        int sentenceCount = 0;

        for (String sentence : sentences) {
            String cleanSentence = compactWhitespace(sentence);
            if (cleanSentence.isBlank()) {
                continue;
            }

            if (!shortNote.isEmpty()) {
                shortNote.append(' ');
            }
            shortNote.append(cleanSentence);
            sentenceCount += 1;

            if (sentenceCount >= 3 || shortNote.length() >= MAX_BACK_LENGTH) {
                break;
            }
        }

        if (shortNote.isEmpty()) {
            shortNote.append(normalized);
        }

        return truncate(shortNote.toString(), MAX_BACK_LENGTH);
    }

    private boolean isUsefulCard(GeneratedCardDraft draft) {
        String front = compactWhitespace(draft.front());
        String back = compactWhitespace(draft.back());

        if (front.length() < 12 || back.length() < 20) {
            return false;
        }

        if (front.equalsIgnoreCase(back)) {
            return false;
        }

        if (PLACEHOLDER_PATTERN.matcher(front).find() || PLACEHOLDER_PATTERN.matcher(back).find()) {
            return false;
        }

        if (VISUAL_REFERENCE_PATTERN.matcher(front).find() || VISUAL_REFERENCE_PATTERN.matcher(back).find()) {
            return false;
        }

        return true;
    }

    private CardType parseCardType(String rawType) {
        if (rawType == null || rawType.isBlank()) {
            return null;
        }

        try {
            return CardType.valueOf(rawType.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private String serializeDrafts(List<GeneratedCardDraft> drafts) {
        try {
            List<Map<String, String>> payload = drafts.stream()
                .map(draft -> Map.of(
                    "type", draft.type().name(),
                    "front", draft.front(),
                    "back", draft.back()
                ))
                .toList();

            return objectMapper.writeValueAsString(payload);
        } catch (Exception ex) {
            log.debug("Failed to serialize draft cards for refinement.", ex);
            return "";
        }
    }

    private String cardFingerprint(GeneratedCardDraft draft) {
        return draft.type().name()
            + "|"
            + compactWhitespace(draft.front()).toLowerCase(Locale.ROOT)
            + "|"
            + compactWhitespace(draft.back()).toLowerCase(Locale.ROOT);
    }

    private String compactWhitespace(String value) {
        return normalizeSentence(value);
    }

    private String buildDefinitionFront(String sentence) {
        Matcher matcher = DEFINABLE_PHRASE_PATTERN.matcher(sentence);
        if (matcher.find()) {
            String concept = cleanConcept(matcher.group(1));
            if (!concept.isBlank()) {
                return truncate("What is " + concept + "?", MAX_FRONT_LENGTH);
            }
        }

        int colonIndex = sentence.indexOf(':');
        if (colonIndex > 0 && colonIndex < 70) {
            String lead = cleanConcept(sentence.substring(0, colonIndex));
            if (!lead.isBlank()) {
                return truncate("Explain: " + lead, MAX_FRONT_LENGTH);
            }
        }

        return truncate("Explain this statement: " + sentence, MAX_FRONT_LENGTH);
    }

    private String buildExampleFront(String sentence) {
        String lower = sentence.toLowerCase();
        if (lower.contains("solve") || lower.contains("equation")) {
            return truncate("Solve and explain: " + sentence, MAX_FRONT_LENGTH);
        }
        return truncate("Work through this example: " + sentence, MAX_FRONT_LENGTH);
    }

    private String buildEdgeCaseFront(String sentence) {
        return truncate("What pitfall is shown here: " + sentence, MAX_FRONT_LENGTH);
    }

    private String buildGenericFront(String sentence) {
        return truncate("Explain: " + sentence, MAX_FRONT_LENGTH);
    }

    private String fallbackFrontForType(CardType type, String snippet) {
        return switch (type) {
            case DEFINITION -> truncate("Explain this idea: " + snippet, MAX_FRONT_LENGTH);
            case EXAMPLE -> truncate("Work through this example: " + snippet, MAX_FRONT_LENGTH);
            case EDGE_CASE -> truncate("What edge case is present here: " + snippet, MAX_FRONT_LENGTH);
            default -> truncate("Summarize this key point: " + snippet, MAX_FRONT_LENGTH);
        };
    }

    private String normalizeSentence(String value) {
        if (value == null) {
            return "";
        }
        return value.replace('\u0000', ' ').replaceAll("\\s+", " ").trim();
    }

    private String cleanConcept(String value) {
        if (value == null) {
            return "";
        }
        return value.replaceAll("[^\\p{L}\\p{N}\\- ]", "").trim();
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value == null ? "" : value;
        }
        return value.substring(0, maxLength - 3).trim() + "...";
    }

    private String fallbackRelationshipGraph(String chunk) {
        String snippet = chunk == null ? "" : chunk.substring(0, Math.min(chunk.length(), 160));
        return "{\"nodes\":[{\"id\":\"Core Concept\"},{\"id\":\"Related Concept\"}]," +
            "\"links\":[{\"source\":\"Core Concept\",\"target\":\"Related Concept\",\"label\":\"influences\"}]," +
            "\"context\":\"" + snippet.replace("\"", "'") + "\"}";
    }

    private String cleanJson(String raw) {
        return raw.replace("```json", "")
            .replace("```", "")
            .trim();
    }
}
