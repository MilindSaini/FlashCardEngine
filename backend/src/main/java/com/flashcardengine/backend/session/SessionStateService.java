package com.flashcardengine.backend.session;

import com.flashcardengine.backend.deck.DeckService;
import com.flashcardengine.backend.persistence.entity.SessionStateEntity;
import com.flashcardengine.backend.persistence.entity.SessionStateId;
import com.flashcardengine.backend.persistence.repository.CardRepository;
import com.flashcardengine.backend.persistence.repository.SessionStateRepository;
import com.flashcardengine.backend.session.dto.SessionStateResponse;
import com.flashcardengine.backend.session.dto.UpdateSessionRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
public class SessionStateService {

    private final SessionStateRepository sessionStateRepository;
    private final DeckService deckService;
    private final CardRepository cardRepository;

    public SessionStateService(SessionStateRepository sessionStateRepository,
                               DeckService deckService,
                               CardRepository cardRepository) {
        this.sessionStateRepository = sessionStateRepository;
        this.deckService = deckService;
        this.cardRepository = cardRepository;
    }

    @Transactional
    public SessionStateResponse getSession(UUID userId, UUID deckId) {
        deckService.getDeckForUser(deckId, userId);
        SessionStateEntity state = loadOrCreate(userId, deckId);
        if (state.getTotalCards() == 0) {
            state.setTotalCards(Math.toIntExact(cardRepository.countByDeckId(deckId)));
        }
        state.setLastAccessed(Instant.now());
        SessionStateEntity saved = sessionStateRepository.save(state);
        return toResponse(saved);
    }

    @Transactional
    public SessionStateResponse updateSession(UUID userId, UUID deckId, UpdateSessionRequest request) {
        deckService.getDeckForUser(deckId, userId);
        SessionStateEntity state = loadOrCreate(userId, deckId);
        state.setCurrentCardIndex(request.currentCardIndex());
        state.setCompletedCards(request.completedCards());
        state.setTotalCards(request.totalCards());
        state.setAllCardsMode(request.allCardsMode());
        state.setLastAccessed(Instant.now());
        SessionStateEntity saved = sessionStateRepository.save(state);
        return toResponse(saved);
    }

    private SessionStateEntity loadOrCreate(UUID userId, UUID deckId) {
        SessionStateId id = new SessionStateId(userId, deckId);
        return sessionStateRepository.findById(id).orElseGet(() -> {
            SessionStateEntity entity = new SessionStateEntity();
            entity.setId(id);
            entity.setCurrentCardIndex(0);
            entity.setCompletedCards(0);
            entity.setTotalCards(0);
            entity.setAllCardsMode(false);
            entity.setLastAccessed(Instant.now());
            return entity;
        });
    }

    private SessionStateResponse toResponse(SessionStateEntity state) {
        return new SessionStateResponse(
            state.getId().getDeckId(),
            state.getCurrentCardIndex(),
            state.getCompletedCards(),
            state.getTotalCards(),
            state.isAllCardsMode(),
            state.getLastAccessed()
        );
    }
}
