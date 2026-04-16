package com.flashcardengine.backend.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class SessionCardProgressId implements Serializable {

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "deck_id", nullable = false)
    private UUID deckId;

    @Column(name = "card_id", nullable = false)
    private UUID cardId;

    public SessionCardProgressId() {
    }

    public SessionCardProgressId(UUID userId, UUID deckId, UUID cardId) {
        this.userId = userId;
        this.deckId = deckId;
        this.cardId = cardId;
    }

    public UUID getUserId() {
        return userId;
    }

    public void setUserId(UUID userId) {
        this.userId = userId;
    }

    public UUID getDeckId() {
        return deckId;
    }

    public void setDeckId(UUID deckId) {
        this.deckId = deckId;
    }

    public UUID getCardId() {
        return cardId;
    }

    public void setCardId(UUID cardId) {
        this.cardId = cardId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof SessionCardProgressId that)) {
            return false;
        }
        return Objects.equals(userId, that.userId)
            && Objects.equals(deckId, that.deckId)
            && Objects.equals(cardId, that.cardId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, deckId, cardId);
    }
}
