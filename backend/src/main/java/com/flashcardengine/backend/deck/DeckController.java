package com.flashcardengine.backend.deck;

import com.flashcardengine.backend.common.SecurityUtils;
import com.flashcardengine.backend.deck.dto.CreateDeckRequest;
import com.flashcardengine.backend.deck.dto.DeckSummaryResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

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
}
