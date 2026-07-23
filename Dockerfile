FROM node:18-slim

# Werkmap instellen
WORKDIR /usr/src/app

# Dependencies kopiëren en installeren
COPY package*.json ./
RUN npm install

# Rest van de code kopiëren
COPY . .

# Poort openstellen voor de Express webserver
EXPOSE 3000

# App starten
CMD [ "npm", "start" ]
