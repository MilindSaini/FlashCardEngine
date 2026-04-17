package com.flashcardengine.backend.persistence.repository;

import com.flashcardengine.backend.persistence.entity.CardSm2StateEntity;
import com.flashcardengine.backend.persistence.entity.CardType;
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
        where c.deck.id = :deckId
          and c.type <> :excludedType
          and s.repetitionCount >= :minRepetitions
          and s.averageGrade >= :minAverageGrade
        """)
    long countMasteredByDeckId(@Param("deckId") UUID deckId,
                               @Param("excludedType") CardType excludedType,
                               @Param("minRepetitions") int minRepetitions,
                               @Param("minAverageGrade") double minAverageGrade);

    @Query("""
        select count(s) from CardSm2StateEntity s
        join s.card c
        where c.deck.id = :deckId
          and c.type <> :excludedType
          and s.averageGrade < :maxAverageGrade
          and exists (select rh.id from ReviewHistoryEntity rh where rh.card = c)
        """)
    long countShakyByDeckId(@Param("deckId") UUID deckId,
                            @Param("excludedType") CardType excludedType,
                            @Param("maxAverageGrade") double maxAverageGrade);

    @Query("""
        select count(c) from CardEntity c
        left join CardSm2StateEntity s on s.card = c
        where c.deck.id = :deckId
          and c.type <> :excludedType
          and (s is null or s.nextReviewDate <= :today)
        """)
    long countUpcomingByDeckId(@Param("deckId") UUID deckId,
                               @Param("today") LocalDate today,
                               @Param("excludedType") CardType excludedType);

    @Query("""
        select min(coalesce(s.nextReviewDate, :today))
        from CardEntity c
        left join CardSm2StateEntity s on s.card = c
        where c.deck.id = :deckId
          and c.type <> :excludedType
        """)
    LocalDate findNextReviewDateByDeckId(@Param("deckId") UUID deckId,
                                         @Param("today") LocalDate today,
                                         @Param("excludedType") CardType excludedType);
}
