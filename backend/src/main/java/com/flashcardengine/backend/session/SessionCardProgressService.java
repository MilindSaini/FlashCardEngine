package com.flashcardengine.backend.session;

import com.flashcardengine.backend.persistence.entity.SessionCardProgressEntity;
import com.flashcardengine.backend.persistence.entity.SessionCardProgressId;
import com.flashcardengine.backend.persistence.repository.SessionCardProgressRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

@Service
public class SessionCardProgressService {

    private final SessionCardProgressRepository sessionCardProgressRepository;

    public SessionCardProgressService(SessionCardProgressRepository sessionCardProgressRepository) {
        this.sessionCardProgressRepository = sessionCardProgressRepository;
    }

    @Transactional(readOnly = true)
    public Set<UUID> completedCardIds(UUID userId, UUID deckId) {
        return new LinkedHashSet<>(sessionCardProgressRepository.findCompletedCardIds(userId, deckId));
    }

    @Transactional
    public void markCardCompleted(UUID userId, UUID deckId, UUID cardId) {
        SessionCardProgressId id = new SessionCardProgressId(userId, deckId, cardId);
        SessionCardProgressEntity entity = sessionCardProgressRepository.findById(id).orElseGet(() -> {
            SessionCardProgressEntity created = new SessionCardProgressEntity();
            created.setId(id);
            return created;
        });

        Instant now = Instant.now();
        entity.setCompleted(false);
        entity.setCompletedAt(now);
        entity.setLastAccessed(now);
        sessionCardProgressRepository.save(entity);
    }

    @Transactional
    public void clearDeckProgress(UUID userId, UUID deckId) {
        sessionCardProgressRepository.deleteByIdUserIdAndIdDeckId(userId, deckId);
    }
}
