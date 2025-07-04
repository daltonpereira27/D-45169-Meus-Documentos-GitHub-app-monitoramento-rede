# Utiliza uma imagem base oficial do Node.js.
FROM node:18-alpine

# Define o diretório de trabalho dentro do contentor.
WORKDIR /usr/src/app

# Copia os ficheiros de definição de pacotes.
COPY package*.json ./

# Instala as dependências da aplicação.
RUN npm install

# Copia o resto dos ficheiros da aplicação para o diretório de trabalho.
COPY . .

# Expõe a porta 3000, que a nossa aplicação Node.js irá utilizar.
EXPOSE 3000

# O comando para iniciar a aplicação quando o contentor for executado.
CMD [ "node", "server.js" ]
