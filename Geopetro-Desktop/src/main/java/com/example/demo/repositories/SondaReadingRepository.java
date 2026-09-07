package com.example.demo.repositories;

import com.example.demo.models.SondaReading;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface SondaReadingRepository extends JpaRepository<SondaReading, Long> {

    List<SondaReading> findByTimestampBetweenOrderByTimestampAsc(LocalDateTime start, LocalDateTime end);
}
