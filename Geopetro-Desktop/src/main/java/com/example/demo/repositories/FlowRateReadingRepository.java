package com.example.demo.repositories;

import com.example.demo.models.FlowRateReading;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface FlowRateReadingRepository extends JpaRepository<FlowRateReading, Long> {

    List<FlowRateReading> findByTimestampBetweenOrderByTimestampAsc(LocalDateTime start, LocalDateTime end);
}