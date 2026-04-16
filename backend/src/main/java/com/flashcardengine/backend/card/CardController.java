package com.flashcardengine.backend.card;

import com.flashcardengine.backend.card.dto.DueCardResponse;
import com.flashcardengine.backend.card.dto.ReviewRequest;
import com.flashcardengine.backend.card.dto.ReviewResponse;
import com.flashcardengine.backend.common.SecurityUtils;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class CardController {

    private final CardService cardService;
    private final ReviewService reviewService;
    private final SecurityUtils securityUtils;

    public CardController(CardService cardService,
                          ReviewService reviewService,
                          SecurityUtils securityUtils) {
        this.cardService = cardService;
        this.reviewService = reviewService;
        this.securityUtils = securityUtils;
    }

    @GetMapping("/decks/{deckId}/due-cards")
    public List<DueCardResponse> dueCards(@PathVariable UUID deckId) {
        return cardService.dueCards(securityUtils.currentUserId(), deckId);
    }

    @GetMapping("/decks/{deckId}/cards")
    public List<DueCardResponse> deckCards(@PathVariable UUID deckId) {
        return cardService.deckCards(securityUtils.currentUserId(), deckId);
    }

    @PostMapping("/cards/{cardId}/review")
    public ReviewResponse submitReview(@PathVariable UUID cardId, @Valid @RequestBody ReviewRequest request) {
        return reviewService.submitReview(securityUtils.currentUserId(), cardId, request.grade());
    }
}
