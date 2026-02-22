Контекст: 
1. Я ученик, выполняю задания 
2. Задание называется "Объединение сервисов через SSO и работа с данными для аналитики" 
3. Дополняй всё что возможно ссылками на документацию
4. Всё что может быть сделано в конфигах сделай в конфигах а не в GUI
/docker-compose.yaml
```
services:
  keycloak_db:
    image: postgres:14
    environment:
      POSTGRES_DB: keycloak_db
      POSTGRES_USER: keycloak_user
      POSTGRES_PASSWORD: keycloak_password
    volumes:
      - ./postgres-keycloak-data:/var/lib/postgresql/data
    ports:
      - "5433:5432"
  keycloak:
    image: quay.io/keycloak/keycloak:21.1
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://keycloak_db:5432/keycloak_db
      KC_DB_USERNAME: keycloak_user
      KC_DB_PASSWORD: keycloak_password
    command: 
      - start-dev
      - --import-realm
    volumes:
      - ./keycloak/realm-export.json:/opt/keycloak/data/import/realm-export.json
    ports:
      - "8080:8080"
    depends_on:
      - keycloak_db
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      REACT_APP_API_URL: http://localhost:8000
      REACT_APP_KEYCLOAK_URL: http://localhost:8080
      REACT_APP_KEYCLOAK_REALM: reports-realm
      REACT_APP_KEYCLOAK_CLIENT_ID: reports-frontend

```

/keycloak/realm-export.json
```
{
    "realm": "reports-realm",
    "enabled": true,
    "roles": {
      "realm": [
        {
          "name": "user",
          "description": "Regular user role"
        },
        {
          "name": "administrator",
          "description": "Administrator role"
        },
        {
          "name": "prothetic_user",
          "description": "Prothetic user role with report access"
        }
      ]
    },
    "users": [
      {
        "username": "user1",
        "enabled": true,
        "email": "user1@example.com",
        "firstName": "User",
        "lastName": "One",
        "credentials": [
          {
            "type": "password",
            "value": "password123",
            "temporary": false
          }
        ],
        "realmRoles": ["user"]
      },
      {
        "username": "user2",
        "enabled": true,
        "email": "user2@example.com",
        "firstName": "User",
        "lastName": "Two",
        "credentials": [
          {
            "type": "password",
            "value": "password123",
            "temporary": false
          }
        ],
        "realmRoles": ["user"]
      },
      {
        "username": "admin1",
        "enabled": true,
        "email": "admin1@example.com",
        "firstName": "Admin",
        "lastName": "One",
        "credentials": [
          {
            "type": "password",
            "value": "admin123",
            "temporary": false
          }
        ],
        "realmRoles": ["administrator"]
      },
      {
        "username": "prothetic1",
        "enabled": true,
        "email": "prothetic1@example.com",
        "firstName": "Prothetic",
        "lastName": "One",
        "credentials": [
          {
            "type": "password",
            "value": "prothetic123",
            "temporary": false
          }
        ],
        "realmRoles": ["prothetic_user"]
      },
      {
        "username": "prothetic2",
        "enabled": true,
        "email": "prothetic2@example.com",
        "firstName": "Prothetic",
        "lastName": "Two",
        "credentials": [
          {
            "type": "password",
            "value": "prothetic123",
            "temporary": false
          }
        ],
        "realmRoles": ["prothetic_user"]
      },
      {
        "username": "prothetic3",
        "enabled": true,
        "email": "prothetic3@example.com",
        "firstName": "Prothetic",
        "lastName": "Three",
        "credentials": [
          {
            "type": "password",
            "value": "prothetic123",
            "temporary": false
          }
        ],
        "realmRoles": ["prothetic_user"]
      }
    ],
    "clients": [
      {
        "clientId": "reports-frontend",
        "enabled": true,
        "publicClient": true,
        "redirectUris": ["http://localhost:3000/*"],
        "webOrigins": ["http://localhost:3000"],
        "directAccessGrantsEnabled": true,
        "attributes": {
          "pkce.code.challenge.method": "S256"
        }
      },
      {
        "clientId": "reports-api",
        "enabled": true,
        "clientAuthenticatorType": "client-secret",
        "secret": "oNwoLQdvJAvRcL89SydqCWCe5ry1jMgq", 
        "bearerOnly": true
      }
    ]
  }
```

/frontend/Dockerfile
```
# Build stage
FROM node:16-alpine as build

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 3000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
```

/frontend/public/index.html
```
<!doctype html>
<html>
<head>
    <title>Reports App</title>
</head>
<body>

    <div id="root"></div>
</body>
</html>
```

/frontend/src/App.tsx
```
import React from 'react';
import { ReactKeycloakProvider } from '@react-keycloak/web';
import Keycloak, { KeycloakConfig } from 'keycloak-js';
import ReportPage from './components/ReportPage';

const keycloakConfig: KeycloakConfig = {
  url: process.env.REACT_APP_KEYCLOAK_URL,
  realm: process.env.REACT_APP_KEYCLOAK_REALM || "",
  clientId: process.env.REACT_APP_KEYCLOAK_CLIENT_ID || ""
};

const keycloak = new Keycloak(keycloakConfig);

const App: React.FC = () => {
  return (
    <ReactKeycloakProvider
      authClient={keycloak}
      initOptions={{
        pkceMethod: 'S256',
        onLoad: 'login-required'
      }}
    >
      <div className="App">
        <ReportPage />
      </div>
    </ReactKeycloakProvider>
  );
};

export default App;
```
/frontend/src/index.css
```
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```
/frontend/src/index.tsx
```
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```
/frontend/src/components/ReportPage.tsx
```
import React, { useState } from 'react';
import { useKeycloak } from '@react-keycloak/web';

const ReportPage: React.FC = () => {
  const { keycloak, initialized } = useKeycloak();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadReport = async () => {
    if (!keycloak?.token) {
      setError('Not authenticated');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${process.env.REACT_APP_API_URL}/reports`, {
        headers: {
          'Authorization': `Bearer ${keycloak.token}`
        }
      });

      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (!initialized) {
    return <div>Loading...</div>;
  }

  if (!keycloak.authenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <button
          onClick={() => keycloak.login()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Login
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6">Usage Reports</h1>
        
        <button
          onClick={downloadReport}
          disabled={loading}
          className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 ${
            loading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {loading ? 'Generating Report...' : 'Download Report'}
        </button>

        {error && (
          <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportPage;
```
/frontend/nginx.conf
```
server {
    listen 3000;
    server_name localhost;
    
    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }
    
    # Enable CORS
    add_header 'Access-Control-Allow-Origin' '*';
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
    add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization';
    
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}
```
объясни следующее задание, в том же контесте Задача 3. Обеспечьте безопасное получение и хранение access-и refresh-токенов. Перенесите механизм запроса access- и refresh-токен из фронтенда в новый бэкенд-сервис, который реализует интеграцию с Keycloak и работу с сессиями. Назовите сервер bionicpro-auth. Написать его на javascript. Можно использовать либы и фреймворки. Настройте Keycloak на работу с refresh_token. Установите время работы access_token — не более 2 минут. При успешной авторизации на бэкенде сохраните refresh_token в зашифрованном виде в оперативной памяти. Сохраните access_token в оперативной памяти сервера. Обеспечьте привязку access_token и refresh_token к сессии. В ответе фронтенду вместо токенов отдайте сессионную cookie c HTTP-only и Secure-флагами. Время жизни сессии должно быть больше времени жизни access_token, чтобы при истечении access_token можно было обновить access_token через refresh_token. 10. Обновите код фронтенд-приложения, убрав из него механизм получения токенов и сделав обязательным прокидывание на бэкенд сессионной cookie. 11. Если access_token устареет, то сервис сам должен сходить за новым в keycloak, используя refresh token. 12. Реализуйте ротацию сессии в рамках действующего access_token для предотвращения session fixation attack. Для этого при очередном запросе к защищённому ресурсу при успешной проверке сессии на сервисе он перепривязывает access_token и refresh_token к новому session id, обновляет cookie и возвращает новый session id в ответе фронтенду.