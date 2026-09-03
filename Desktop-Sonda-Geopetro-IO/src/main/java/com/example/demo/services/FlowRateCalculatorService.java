package com.example.demo.services;

import org.springframework.stereotype.Service;

import java.util.LinkedList;
import java.util.Queue;

@Service
public class FlowRateCalculatorService {

    private static final long TIME_WINDOW_MS = 60000;

    private final Queue<ReadingData> history = new LinkedList<>();
    private boolean firstReading = true;

    public synchronized double calculateBblPerMinute(long currentStroke, double pumpConstant) {
        long now = System.currentTimeMillis();
        double volumeBbl = currentStroke * pumpConstant;

        if (firstReading) {
            firstReading = false;
            history.offer(new ReadingData(now, currentStroke, volumeBbl));
            return 0.0;
        }

        history.offer(new ReadingData(now, currentStroke, volumeBbl));
        clearOldHistory(now);

        if (history.isEmpty()) {
            return 0.0;
        }

        long totalStrokes = 0;
        double totalVolumeBbl = 0.0;
        for (ReadingData data : history) {
            totalStrokes += data.currentStroke;
            totalVolumeBbl += data.volumeBbl;
        }

        if (totalStrokes <= 0) {
            return 0.0;
        }

        double bblPerStroke = totalVolumeBbl / totalStrokes;
        if (history.size() == 1) {
            return bblPerStroke;
        }

        ReadingData first = history.peek();
        ReadingData last = ((LinkedList<ReadingData>) history).getLast();
        long deltaMillis = last.timestamp - first.timestamp;
        if (deltaMillis <= 0) {
            return bblPerStroke;
        }

        double deltaSeconds = deltaMillis / 1000.0;
        double strokesPerMinute = (totalStrokes / deltaSeconds) * 60.0;

        return bblPerStroke * strokesPerMinute;
    }

    public synchronized void reset() {
        firstReading = true;
        history.clear();
    }

    private void clearOldHistory(long now) {
        while (!history.isEmpty()) {
            ReadingData first = history.peek();
            if (now - first.timestamp > TIME_WINDOW_MS) {
                history.poll();
            } else {
                break;
            }
        }
    }

    private static class ReadingData {
        private final long timestamp;
        private final long currentStroke;
        private final double volumeBbl;

        private ReadingData(long timestamp, long currentStroke, double volumeBbl) {
            this.timestamp = timestamp;
            this.currentStroke = currentStroke;
            this.volumeBbl = volumeBbl;
        }
    }
}
