package com.flashcardengine.backend.persistence.repository;

import com.flashcardengine.backend.persistence.entity.CardSm2StateEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

public interface CardSm2StateRepository extends JpaRepository<CardSm2StateEntity, UUID> {

    @Query("select s from CardSm2StateEntity s where s.card.id = :cardId")
    Optional<CardSm2StateEntity> findByCardId(@Param("cardId") UUID cardId);

    @Query("""
        select count(s) from CardSm2StateEntity s
        join s.card c
        where c.deck.id = :deckId and s.repetitionCount >= 3 and s.averageGrade >= 4.0
        """)
    long countMasteredByDeckId(@Param("deckId") UUID deckId);

    @Query("""
        select count(s) from CardSm2StateEntity s
        join s.card c
        where c.deck.id = :deckId and s.averageGrade < 2.5
        """)
    long countShakyByDeckId(@Param("deckId") UUID deckId);

    @Query("""
        select count(c) from CardEntity c
        left join CardSm2StateEntity s on s.card = c
        where c.deck.id = :deckId and (s is null or s.nextReviewDate <= :today)
        """)
    long countUpcomingByDeckId(@Param("deckId") UUID deckId, @Param("today") LocalDate today);
}
