package com.flashcardengine.backend.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "session_card_progress")
public class SessionCardProgressEntity {

    @EmbeddedId
    private SessionCardProgressId id;

    @Column(name = "completed", nullable = false)
    private boolean completed;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "last_accessed", nullable = false)
    private Instant lastAccessed;

    @PrePersist
    void prePersist() {
        if (lastAccessed == null) {
            lastAccessed = Instant.now();
        }
    }

    public SessionCardProgressId getId() {
        return id;
    }

    public void setId(SessionCardProgressId id) {
        this.id = id;
    }

    public boolean isCompleted() {
        return completed;
    }

    public void setCompleted(boolean completed) {
        this.completed = completed;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(Instant completedAt) {
        this.completedAt = completedAt;
    }

    public Instant getLastAccessed() {
        return lastAccessed;
    }

    public void setLastAccessed(Instant lastAccessed) {
        this.lastAccessed = lastAccessed;
    }
}
