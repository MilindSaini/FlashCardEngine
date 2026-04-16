package com.flashcardengine.backend.persistence.repository;

import com.flashcardengine.backend.persistence.entity.DeckEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DeckRepository extends JpaRepository<DeckEntity, UUID> {

    @Query("select d from DeckEntity d where d.user.id = :userId order by d.createdAt desc")
    List<DeckEntity> findAllByUserId(@Param("userId") UUID userId);

    @Query("select d from DeckEntity d where d.id = :deckId and d.user.id = :userId")
    Optional<DeckEntity> findByIdAndUserId(@Param("deckId") UUID deckId, @Param("userId") UUID userId);
}
