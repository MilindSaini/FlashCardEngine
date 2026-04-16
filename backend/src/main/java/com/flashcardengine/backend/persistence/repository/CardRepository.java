package com.flashcardengine.backend.persistence.repository;

import com.flashcardengine.backend.persistence.entity.CardEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CardRepository extends JpaRepository<CardEntity, UUID> {

    @Query("select c from CardEntity c join c.deck d where c.id = :cardId and d.user.id = :userId")
    Optional<CardEntity> findByIdAndUserId(@Param("cardId") UUID cardId, @Param("userId") UUID userId);

    @Query("""
        select c from CardEntity c
        join c.deck d
        left join CardSm2StateEntity s on s.card = c
        where d.id = :deckId and d.user.id = :userId and (s is null or s.nextReviewDate <= :today)
        order by case when s.nextReviewDate is null then 0 else 1 end asc,
                 s.nextReviewDate asc,
                 c.createdAt asc
        """)
    List<CardEntity> findDueCards(@Param("deckId") UUID deckId,
                                  @Param("userId") UUID userId,
                                  @Param("today") LocalDate today);

    @Query("select count(c) from CardEntity c where c.deck.id = :deckId")
    long countByDeckId(@Param("deckId") UUID deckId);

    @Query("""
        select c from CardEntity c
        join c.deck d
        where d.id = :deckId and d.user.id = :userId
        order by c.createdAt asc, c.id asc
        """)
    List<CardEntity> findDeckCards(@Param("deckId") UUID deckId, @Param("userId") UUID userId);
}
