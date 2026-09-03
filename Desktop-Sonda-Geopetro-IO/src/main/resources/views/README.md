# 📄 Telas FXML (Views)

Esta pasta contém todos os arquivos FXML que definem as interfaces gráficas da aplicação.

## Arquivos Existentes

### main-view.fxml
**Descrição:** Tela principal da aplicação
**Controlador:** `com.example.demo.controllers.MainViewFxmlController`
**Componentes:**
- Header com título
- Painel de informações do sistema
- Botões de ação (Teste 1, Teste 2, Atualizar Status, Sair)
- Labels para status dinâmico

## Como Criar uma Nova Tela

### Passo 1: Criar arquivo FXML
Crie um novo arquivo em `src/main/resources/views/minha-tela.fxml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<?import javafx.scene.control.*?>
<?import javafx.scene.layout.*?>

<VBox xmlns="http://javafx.com/javafx/21" 
      xmlns:fx="http://javafx.com/fxml/1" 
      fx:controller="com.example.demo.controllers.MinhaTelaController">
   <Label text="Minha Tela" />
</VBox>
```

### Passo 2: Criar Controlador
Crie `src/main/java/com/example/demo/controllers/MinhaTelaController.java`

```java
@Controller
public class MinhaTelaController {
    @FXML
    public void initialize() {
        // Lógica de inicialização
    }
}
```

### Passo 3: Carregar em outra tela
```java
FXMLLoader loader = new FXMLLoader(getClass().getResource("/views/minha-tela.fxml"));
loader.setControllerFactory(applicationContext::getBean);
Parent root = loader.load();
```

## Convenções

- ✅ Nome do arquivo FXML em kebab-case: `minha-tela.fxml`
- ✅ Nome do controlador em PascalCase: `MinhaTelaController.java`
- ✅ IDs dos componentes em camelCase: `btnSalvar`, `txtNome`
- ✅ Máximo 200 linhas por arquivo FXML
- ✅ Use comentários para agrupar seções

## Exemplo Completo

**tela-usuarios.fxml:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<?import javafx.geometry.Insets?>
<?import javafx.scene.control.*?>
<?import javafx.scene.layout.*?>
<?import javafx.scene.text.Font?>

<BorderPane xmlns="http://javafx.com/javafx/21" xmlns:fx="http://javafx.com/fxml/1" fx:controller="com.example.demo.controllers.UsuariosController">
   <top>
      <HBox spacing="10.0" style="-fx-padding: 15;" style="-fx-background-color: #f0f0f0;">
         <Label text="Gerenciamento de Usuários" style="-fx-font-size: 18; -fx-font-weight: bold;" />
      </HBox>
   </top>
   <center>
      <TableView fx:id="tblUsuarios" prefHeight="400.0" prefWidth="600.0">
         <columns>
            <TableColumn prefWidth="100.0" text="ID" />
            <TableColumn prefWidth="200.0" text="Nome" />
            <TableColumn prefWidth="200.0" text="Email" />
         </columns>
      </TableView>
   </center>
   <bottom>
      <HBox spacing="10.0" style="-fx-padding: 15;">
         <Button fx:id="btnAdicionar" text="Adicionar" />
         <Button fx:id="btnEditar" text="Editar" />
         <Button fx:id="btnDeletar" text="Deletar" />
      </HBox>
   </bottom>
</BorderPane>
```

**UsuariosController.java:**
```java
@Controller
public class UsuariosController {
    
    @Autowired
    private UsuarioService usuarioService;
    
    @FXML
    private TableView<Usuario> tblUsuarios;
    
    @FXML
    private Button btnAdicionar;
    
    @FXML
    public void initialize() {
        btnAdicionar.setOnAction(e -> handleAdicionar());
        carregarDados();
    }
    
    private void carregarDados() {
        tblUsuarios.setItems(
            FXCollections.observableArrayList(usuarioService.getAll())
        );
    }
    
    private void handleAdicionar() {
        // Abrir diálogo ou nova tela
    }
}
```

## Estrutura Recomendada

```
views/
├── main-view.fxml              (Tela principal)
├── dashboard.fxml              (Dashboard)
├── usuarios.fxml               (Gerenciamento de usuários)
├── sondas.fxml                 (Gerenciamento de sondas)
├── configuracoes.fxml          (Configurações)
└── dialogs/
    ├── usuario-dialog.fxml     (Diálogo de usuário)
    └── sonda-dialog.fxml       (Diálogo de sonda)
```

## Imports Comuns

```xml
<!-- Layouts -->
<?import javafx.scene.layout.VBox?>
<?import javafx.scene.layout.HBox?>
<?import javafx.scene.layout.BorderPane?>
<?import javafx.scene.layout.GridPane?>

<!-- Controls -->
<?import javafx.scene.control.Button?>
<?import javafx.scene.control.Label?>
<?import javafx.scene.control.TextField?>
<?import javafx.scene.control.TableView?>
<?import javafx.scene.control.TableColumn?>
<?import javafx.scene.control.ComboBox?>
<?import javafx.scene.control.CheckBox?>
<?import javafx.scene.control.TextArea?>

<!-- Outros -->
<?import javafx.geometry.Insets?>
<?import javafx.scene.text.Font?>
```

## Recursos Úteis

- Consulte `GUIA_FXML.md` para guia completo
- Consulte `EXEMPLOS_PRATICOS.md` para exemplos
- JavaFX Scene Builder: https://gluonhq.com/products/scene-builder/

---

Bem-vindo ao desenvolvimento com FXML! 🎉
