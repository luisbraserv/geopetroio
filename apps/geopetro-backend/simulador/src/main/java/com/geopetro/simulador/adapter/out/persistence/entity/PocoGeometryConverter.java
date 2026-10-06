package com.geopetro.simulador.adapter.out.persistence.entity;

import com.geopetro.simulador.domain.PocoGeometry;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import tools.jackson.databind.json.JsonMapper;

@Converter
public class PocoGeometryConverter implements AttributeConverter<PocoGeometry, String> {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    @Override public String convertToDatabaseColumn(PocoGeometry value) {
        return value == null ? null : JSON.writeValueAsString(value);
    }
    @Override public PocoGeometry convertToEntityAttribute(String value) {
        return value == null ? null : JSON.readValue(value, PocoGeometry.class);
    }
}
