package com.flashcardengine.backend.deck;

import com.flashcardengine.backend.common.SecurityUtils;
import com.flashcardengine.backend.deck.dto.CreateDeckRequest;
import com.flashcardengine.backend.deck.dto.DeckSummaryResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/decks")
public class DeckController {

    private final DeckService deckService;
    private final SecurityUtils securityUtils;

    public DeckController(DeckService deckService, SecurityUtils securityUtils) {
        this.deckService = deckService;
        this.securityUtils = securityUtils;
    }

    @PostMapping
    public DeckSummaryResponse createDeck(@Valid @RequestBody CreateDeckRequest request) {
        return deckService.createDeck(securityUtils.currentUserId(), request);
    }

    @GetMapping
    public List<DeckSummaryResponse> listDecks() {
        return deckService.listDecks(securityUtils.currentUserId());
    }

    @DeleteMapping("/{deckId}")
    public Map<String, Object> deleteDeck(@PathVariable UUID deckId) {
        deckService.deleteDeck(securityUtils.currentUserId(), deckId);
        return Map.of(
            "status", "deleted",
            "deckId", deckId
        );
    }
}
