# Modelos (Entities)

Esta pasta contém as classes de modelo (entities) que mapeiam para as tabelas do banco de dados.

## Estrutura:
- `Sonda.java` - Entidade que representa uma sonda
- `Sensor.java` - Entidade que representa um sensor
- `Dados.java` - Entidade que armazena dados dos sensores

## Exemplo de uso:
```java
@Entity
@Table(name = "sondas")
public class Sonda {
    // ...
}
```

Consulte `EXEMPLOS_PRATICOS.md` para exemplos completos.
