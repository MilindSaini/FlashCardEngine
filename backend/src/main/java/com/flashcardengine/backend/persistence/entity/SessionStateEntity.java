package com.flashcardengine.backend.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "session_state")
public class SessionStateEntity {

    @EmbeddedId
    private SessionStateId id;

    @Column(name = "current_card_index", nullable = false)
    private int currentCardIndex;

    @Column(name = "completed_cards", nullable = false)
    private int completedCards;

    @Column(name = "total_cards", nullable = false)
    private int totalCards;

    @Column(name = "all_cards_mode", nullable = false)
    private boolean allCardsMode;

    @Column(name = "last_accessed", nullable = false)
    private Instant lastAccessed;

    @PrePersist
    void prePersist() {
        if (lastAccessed == null) {
            lastAccessed = Instant.now();
        }
    }

    public SessionStateId getId() {
        return id;
    }

    public void setId(SessionStateId id) {
        this.id = id;
    }

    public int getCurrentCardIndex() {
        return currentCardIndex;
    }

    public void setCurrentCardIndex(int currentCardIndex) {
        this.currentCardIndex = currentCardIndex;
    }

    public int getCompletedCards() {
        return completedCards;
    }

    public void setCompletedCards(int completedCards) {
        this.completedCards = completedCards;
    }

    public int getTotalCards() {
        return totalCards;
    }

    public void setTotalCards(int totalCards) {
        this.totalCards = totalCards;
    }

    public boolean isAllCardsMode() {
        return allCardsMode;
    }

    public void setAllCardsMode(boolean allCardsMode) {
        this.allCardsMode = allCardsMode;
    }

    public Instant getLastAccessed() {
        return lastAccessed;
    }

    public void setLastAccessed(Instant lastAccessed) {
        this.lastAccessed = lastAccessed;
    }
}
