package com.flashcardengine.backend.ingestion;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Service
public class EmbeddingService {

    private static final int DIMENSIONS = 256;

    public List<Double> generateEmbedding(String text) {
        double[] vector = new double[DIMENSIONS];
        if (text == null || text.isBlank()) {
            return asList(vector);
        }

        char[] chars = text.toCharArray();
        for (int i = 0; i < chars.length; i++) {
            int bucket = i % DIMENSIONS;
            vector[bucket] += (chars[i] % 127) / 127.0;
        }

        double norm = 0.0;
        for (double value : vector) {
            norm += value * value;
        }
        norm = Math.sqrt(norm);

        if (norm > 0) {
            for (int i = 0; i < vector.length; i++) {
                vector[i] = vector[i] / norm;
            }
        }

        return asList(vector);
    }

    public String toPgVectorLiteral(List<Double> embedding) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < embedding.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(String.format(Locale.US, "%.6f", embedding.get(i)));
        }
        sb.append(']');
        return sb.toString();
    }

    private List<Double> asList(double[] vector) {
        List<Double> values = new ArrayList<>(vector.length);
        for (double value : vector) {
            values.add(value);
        }
        return values;
    }
}
