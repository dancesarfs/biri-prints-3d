# Biri Prints 3D — versão standalone (fora do Claude)

Esta pasta do repositório contém a versão do sistema pensada pra rodar fora do Claude:

- `app/biri-prints-3d-standalone.html` — o sistema completo, pronto pra hospedar fora do Claude (GitHub Pages ou uso local).
- `data/biri-prints-3d-backup.json` — um backup com os dados reais que já estavam salvos (impressora, material, as 5 peças, o grupo "Kit Professores" e a promoção "Dia dos professores"). Importa isso uma vez, depois de configurar tudo.

O sistema já funcionava salvando dados num banco de dados que só existe dentro da Claude. Pra usar fora daqui, com os dados sincronizados entre celular e computador, ele agora usa o **Firebase** (do Google) — que tem um plano gratuito bem generoso pra esse tamanho de uso (50 mil leituras/dia, 20 mil gravações/dia, 1 GB de armazenamento — muito mais do que uma operação pessoal de impressão 3D consome). Também adicionei uma **tela de login** (e-mail/senha), pra ninguém além de você acessar seus preços e orçamentos caso o link vaze.

Nenhum desses passos custa nada, mas alguns exigem criar contas (Google) — são suas contas, não dá pra fazer isso por você. Siga na ordem.

## 1. Criar o projeto no Firebase (grátis)

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e entre com uma conta Google.
2. Clique em **Criar um projeto**, dê um nome (ex.: "biri-prints-3d") e siga o assistente (pode desativar o Google Analytics, não é necessário).
3. Dentro do projeto, no menu lateral, vá em **Build → Firestore Database** e clique em **Criar banco de dados**. Escolha uma região próxima do Brasil (ex.: `southamerica-east1`) e comece em **modo de produção**.
4. Ainda no menu lateral, vá em **Build → Authentication**, clique em **Vamos começar**, e ative o provedor **E-mail/senha**.
5. Na aba **Users** do Authentication, clique em **Adicionar usuário** e crie o seu login: um e-mail (pode ser qualquer um, não precisa ser real) e uma senha. **Guarde essas duas informações** — é o login que você vai usar no sistema.

## 2. Definir as regras de segurança do Firestore

Ainda no Firebase, vá em **Firestore Database → Regras** e substitua o conteúdo por:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Isso garante que só quem estiver logado (você) consegue ler ou escrever os dados. Clique em **Publicar**.

## 3. Pegar as credenciais do seu projeto

1. No Firebase, clique na engrenagem (⚙️) ao lado de "Project Overview" → **Configurações do projeto**.
2. Na aba **Geral**, role até "Seus apps" e clique no ícone **`</>`** (Web) pra registrar um app.
3. Dê um apelido (ex.: "biri-prints-3d-web") e clique em **Registrar app** — **não** marque a opção de hospedagem do Firebase.
4. O Firebase vai mostrar um bloco de código com um objeto parecido com este:
   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "biri-prints-3d.firebaseapp.com",
     projectId: "biri-prints-3d",
     storageBucket: "biri-prints-3d.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef",
   };
   ```
5. Abra o arquivo `app/biri-prints-3d-standalone.html` num editor de texto (Bloco de Notas, VS Code, o que você tiver), procure por `FIREBASE_CONFIG` (fica perto do topo, logo depois dos `<script>` do Firebase) e **substitua os valores "COLE_AQUI"** pelos valores reais que o Firebase te deu.
6. Salve o arquivo.

## 4. Publicar no GitHub Pages

Depois que este repositório já estiver no seu GitHub (com o Claude Code cuidando do push):

1. Vá em **Settings → Pages** do repositório, em "Build and deployment" escolha **Deploy from a branch**, selecione a branch `main` e a pasta `/ (root)`, e salve.
2. Espera um minuto e o GitHub te dá um link tipo `https://seu-usuario.github.io/nome-do-repo/app/biri-prints-3d-standalone.html` — é esse o link do seu sistema, funcionando fora do Claude, em qualquer navegador.
3. No celular, abra esse link e use "Adicionar à tela inicial" pra ele funcionar como um app.

## 5. Fazer login e importar os dados reais

1. Abra o link publicado, faça login com o e-mail/senha que você criou no passo 1.5.
2. Vá na aba **Ajustes** → seção **Importar backup**, no topo → escolha o arquivo `data/biri-prints-3d-backup.json`.
3. Aguarde a mensagem "Backup importado com sucesso!" — suas peças, impressora, material, grupo de kit e promoção reais devem aparecer.

Depois de importar, o sistema já funciona normalmente — os dados ficam salvos no seu Firebase e sincronizados entre qualquer dispositivo em que você fizer login.

## O que muda em relação à versão dentro do Claude

- Os dois sistemas (o hospedado no Claude e essa versão no GitHub) são **independentes** — não sincronizam automaticamente entre si. A partir de agora, escolha qual dos dois vai usar no dia a dia pra não ter dados desencontrados.
- Testei toda a parte de login, cadastro, catálogo e importação de backup simulando o Firebase (não é possível criar um projeto Firebase de verdade a partir do ambiente sandbox do Cowork), então o comportamento da interface está validado — mas o primeiro login de verdade, com o seu projeto Firebase real, é o teste final que só você pode fazer.
- A standalone está bem atrás da versão principal em recursos (ver `docs/bancada-3d-app.md`, seção "Versão standalone" — falta WhatsApp, Clientes, Vendedores/Pedidos, máscara de telefone/e-mail). Com o repositório no GitHub e o Claude Code com acesso direto ao código, esse é um bom próximo passo pra pedir: trazer a standalone pro nível da versão principal.

## Fontes sobre o plano gratuito do Firebase usado nesta explicação

- [Firebase Pricing (Google, oficial)](https://firebase.google.com/pricing)
- [Google Firebase Pricing Explained (2026)](https://blog.back4app.com/firebase-pricing/)
