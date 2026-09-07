# Serviços (Business Logic Layer)

Esta pasta contém as classes de serviço que implementam a lógica de negócio.

## Estrutura:
- `ApplicationService.java` - Serviços gerais da aplicação
- `SondaService.java` - Lógica de negócio para sondas
- `SensorService.java` - Lógica de negócio para sensores
- `DadosService.java` - Lógica de negócio para dados

## Exemplo de uso:
```java
@Service
public class SondaService {
    @Autowired
    private SondaRepository sondaRepository;
    
    public List<Sonda> getAllSondas() {
        return sondaRepository.findAll();
    }
}
```

Consulte `EXEMPLOS_PRATICOS.md` para exemplos completos.
