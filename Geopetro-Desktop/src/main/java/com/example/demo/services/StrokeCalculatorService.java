package com.example.demo.services;

import org.springframework.stereotype.Service;

@Service
public class StrokeCalculatorService {

    private long lastCumulativeStroke = 0;
    private boolean firstReading = true;

    public synchronized long calculateCurrentStroke(long cumulativeStroke) {
        if (firstReading) {
            firstReading = false;
            lastCumulativeStroke = cumulativeStroke;
            return 0;
        }

        long currentStroke = cumulativeStroke - lastCumulativeStroke;
        if (currentStroke < 0) {
            currentStroke = 0;
        }

        lastCumulativeStroke = cumulativeStroke;
        return currentStroke;
    }

    public synchronized void reset() {
        firstReading = true;
        lastCumulativeStroke = 0;
    }
}
