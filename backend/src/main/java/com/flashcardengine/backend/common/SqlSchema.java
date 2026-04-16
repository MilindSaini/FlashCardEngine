package com.flashcardengine.backend.common;

import java.util.regex.Pattern;

public final class SqlSchema {

    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");

    private final String schema;

    private SqlSchema(String schema) {
        this.schema = schema;
    }

    public static SqlSchema of(String schema) {
        return new SqlSchema(requireIdentifier(schema, "schema"));
    }

    public String table(String tableName) {
        return quotedIdentifier(schema) + "." + quotedIdentifier(requireIdentifier(tableName, "tableName"));
    }

    private static String requireIdentifier(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + " must not be blank");
        }

        String trimmed = value.trim();
        if (!IDENTIFIER.matcher(trimmed).matches()) {
            throw new IllegalArgumentException(fieldName + " contains invalid SQL identifier characters: " + trimmed);
        }
        return trimmed;
    }

    private static String quotedIdentifier(String identifier) {
        return "\"" + identifier + "\"";
    }
}