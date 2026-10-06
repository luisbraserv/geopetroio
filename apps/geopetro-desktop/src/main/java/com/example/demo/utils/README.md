# Utilitários

Esta pasta contém classes utilitárias e helpers para facilitar o desenvolvimento.

## Estrutura recomendada:
- `DateUtils.java` - Utilitários para manipulação de datas
- `FormatUtils.java` - Utilitários para formatação
- `ValidationUtils.java` - Utilitários para validação
- `FileUtils.java` - Utilitários para manipulação de arquivos

## Exemplo:
```java
public class DateUtils {
    public static String formatarData(LocalDateTime data) {
        return data.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"));
    }
}
```

Consulte `DESENVOLVIMENTO.md` para mais informações.
