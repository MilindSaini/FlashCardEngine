package com.flashcardengine.backend.persistence.repository;

import com.flashcardengine.backend.persistence.entity.SessionCardProgressEntity;
import com.flashcardengine.backend.persistence.entity.SessionCardProgressId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface SessionCardProgressRepository extends JpaRepository<SessionCardProgressEntity, SessionCardProgressId> {

    @Query("""
        select p.id.cardId
        from SessionCardProgressEntity p
        where p.id.userId = :userId
          and p.id.deckId = :deckId
          and p.completed = false
        """)
    List<UUID> findCompletedCardIds(@Param("userId") UUID userId, @Param("deckId") UUID deckId);

    void deleteByIdUserIdAndIdDeckId(UUID userId, UUID deckId);

    void deleteByIdUserIdAndIdDeckIdAndIdCardId(UUID userId, UUID deckId, UUID cardId);
}
