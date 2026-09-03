# Repositórios (Data Access Layer)

Esta pasta contém as interfaces de repositório para acesso aos dados.

## Estrutura:
- `SondaRepository.java` - Interface para operações CRUD em sondas
- `SensorRepository.java` - Interface para operações CRUD em sensores
- `DadosRepository.java` - Interface para operações CRUD em dados

## Exemplo de uso:
```java
@Repository
public interface SondaRepository extends JpaRepository<Sonda, Long> {
    Optional<Sonda> findByNome(String nome);
}
```

Consulte `EXEMPLOS_PRATICOS.md` para exemplos completos.
