package com.flashcardengine.backend.card;

import com.flashcardengine.backend.persistence.entity.CardEntity;
import com.flashcardengine.backend.persistence.entity.CardSm2StateEntity;
import com.flashcardengine.backend.persistence.entity.DeckEntity;
import com.flashcardengine.backend.persistence.entity.UserEntity;
import com.flashcardengine.backend.persistence.repository.CardRepository;
import com.flashcardengine.backend.persistence.repository.CardSm2StateRepository;
import com.flashcardengine.backend.persistence.repository.ReviewHistoryRepository;
import com.flashcardengine.backend.persistence.repository.UserRepository;
import com.flashcardengine.backend.session.SessionCardProgressService;
import com.flashcardengine.backend.streak.UserStreakService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReviewServiceTest {

    @Mock
    private CardRepository cardRepository;

    @Mock
    private CardSm2StateRepository cardSm2StateRepository;

    @Mock
    private ReviewHistoryRepository reviewHistoryRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private SessionCardProgressService sessionCardProgressService;

    @Mock
    private UserStreakService userStreakService;

    @Spy
    private Sm2Service sm2Service = new Sm2Service();

    @InjectMocks
    private ReviewService reviewService;

    @Test
    void shouldSubmitReviewAndPersistHistoryAndState() {
        UUID userId = UUID.randomUUID();
        UUID cardId = UUID.randomUUID();

        DeckEntity deck = new DeckEntity();
        deck.setId(UUID.randomUUID());

        CardEntity card = new CardEntity();
        card.setId(cardId);
        card.setDeck(deck);

        UserEntity user = new UserEntity();
        user.setId(userId);

        CardSm2StateEntity state = new CardSm2StateEntity();
        state.setCard(card);
        state.setCardId(cardId);
        state.setEasinessFactor(2.5);
        state.setIntervalDays(1);
        state.setRepetitionCount(0);
        state.setAverageGrade(0.0);

        when(cardRepository.findByIdAndUserId(cardId, userId)).thenReturn(Optional.of(card));
        when(cardSm2StateRepository.findByCardId(cardId)).thenReturn(Optional.of(state));
        when(reviewHistoryRepository.countByCardId(cardId)).thenReturn(0L);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        var response = reviewService.submitReview(userId, cardId, 5);

        assertEquals(cardId, response.cardId());
        assertEquals(1, response.repetitionCount());
        assertNotNull(response.nextReviewDate());

        verify(cardSm2StateRepository).save(any(CardSm2StateEntity.class));
        verify(reviewHistoryRepository).save(any());

        ArgumentCaptor<CardSm2StateEntity> stateCaptor = ArgumentCaptor.forClass(CardSm2StateEntity.class);
        verify(cardSm2StateRepository).save(stateCaptor.capture());
        assertEquals(1, stateCaptor.getValue().getRepetitionCount());
    }

    @Test
    void shouldInitializeStateWithoutPrefillingCardId() {
        UUID userId = UUID.randomUUID();
        UUID cardId = UUID.randomUUID();

        DeckEntity deck = new DeckEntity();
        deck.setId(UUID.randomUUID());

        CardEntity card = new CardEntity();
        card.setId(cardId);
        card.setDeck(deck);

        UserEntity user = new UserEntity();
        user.setId(userId);

        when(cardRepository.findByIdAndUserId(cardId, userId)).thenReturn(Optional.of(card));
        when(cardSm2StateRepository.findByCardId(cardId)).thenReturn(Optional.empty());
        when(reviewHistoryRepository.countByCardId(cardId)).thenReturn(0L);
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));

        reviewService.submitReview(userId, cardId, 4);

        ArgumentCaptor<CardSm2StateEntity> stateCaptor = ArgumentCaptor.forClass(CardSm2StateEntity.class);
        verify(cardSm2StateRepository).save(stateCaptor.capture());

        CardSm2StateEntity captured = stateCaptor.getValue();
        assertEquals(card, captured.getCard());
        assertNull(captured.getCardId());
        assertNotNull(captured.getNextReviewDate());
    }
}
