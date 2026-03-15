#!/bin/bash
################################################################################
# deploy-risvoice.sh
# Instalación completa RIS Voice AI en Ubuntu 22.04
# Dominio: risvoice.dmcprojects.cl
# Uso: sudo bash deploy-risvoice.sh
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✔] $1${NC}"; }
warn() { echo -e "${YELLOW}[!] $1${NC}"; }
err()  { echo -e "${RED}[✘] $1${NC}"; exit 1; }
info() { echo -e "${CYAN}[→] $1${NC}"; }

echo -e "${CYAN}"
echo "=================================================="
echo "   RIS Voice AI — Instalación en servidor"
echo "   risvoice.dmcprojects.cl"
echo "=================================================="
echo -e "${NC}"

# ── Verificar root ────────────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && err "Ejecutar como root: sudo bash deploy-risvoice.sh"

# ── Variables ─────────────────────────────────────────────────────────────────
DOMAIN="risvoice.dmcprojects.cl"
APP_USER="risvoice"
APP_DIR="/home/${APP_USER}"
BACKEND_DIR="${APP_DIR}/backend"
FRONTEND_DIR="${APP_DIR}/frontend"
BACKEND_PORT=8020
FRONTEND_PORT=3020
REPO="https://github.com/Dmcdemianpro/dmc_voice.git"

read -sp "Contraseña para PostgreSQL (BD risvoice): " DB_PASSWORD; echo
if id "$APP_USER" &>/dev/null; then
    warn "Usuario ${APP_USER} ya existe — no se solicitará contraseña"
    APP_PASSWORD=""
else
    read -sp "Contraseña para el usuario ${APP_USER} del sistema: " APP_PASSWORD; echo
fi
read -sp "JWT Secret (mín. 32 chars, Enter para generar): " JWT_SECRET; echo
[[ -z "$JWT_SECRET" ]] && JWT_SECRET=$(openssl rand -hex 32)

# ── Cloudflare Origin Certificate ─────────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Configuración SSL — Cloudflare Full Strict${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Debes generar un Origin Certificate en Cloudflare:${NC}"
echo "  1. Panel Cloudflare → dmcprojects.cl"
echo "  2. SSL/TLS → Origin Server → Create Certificate"
echo "  3. Seleccionar: *.dmcprojects.cl  y  dmcprojects.cl"
echo "  4. Validez: 15 años"
echo "  5. Formato: PEM"
echo "  6. Copiar el certificado y la clave privada"
echo ""

# Rutas compartidas — wildcard *.dmcprojects.cl sirve para todos los proyectos
CF_CERT_DIR="/etc/ssl/cloudflare"
CF_CERT="${CF_CERT_DIR}/dmcprojects.cl.pem"
CF_KEY="${CF_CERT_DIR}/dmcprojects.cl.key"

mkdir -p "${CF_CERT_DIR}"
chmod 700 "${CF_CERT_DIR}"

# Si el certificado ya existe (instalado por otro proyecto) reutilizarlo
if [[ -s "${CF_CERT}" && -s "${CF_KEY}" ]]; then
    warn "Certificado wildcard ya existe en ${CF_CERT_DIR} — reutilizando"
    log "Certificados Cloudflare OK (compartidos con otros proyectos)"
else
    echo -e "${YELLOW}Pega el CERTIFICADO (Origin Certificate) y presiona Enter + Ctrl+D:${NC}"
    cat > "${CF_CERT}"
    chmod 644 "${CF_CERT}"

    echo -e "${YELLOW}Pega la CLAVE PRIVADA (Private Key) y presiona Enter + Ctrl+D:${NC}"
    cat > "${CF_KEY}"
    chmod 600 "${CF_KEY}"

    [[ ! -s "${CF_CERT}" ]] && err "Certificado vacío — vuelve a ejecutar el script"
    [[ ! -s "${CF_KEY}"  ]] && err "Clave privada vacía — vuelve a ejecutar el script"
    log "Certificados Cloudflare guardados en ${CF_CERT_DIR}"
fi

# ── 1. Crear usuario del sistema ──────────────────────────────────────────────
info "Creando usuario ${APP_USER}..."
if id "$APP_USER" &>/dev/null; then
    warn "Usuario ${APP_USER} ya existe, continuando..."
else
    useradd -m -s /bin/bash "$APP_USER"
    echo "${APP_USER}:${APP_PASSWORD}" | chpasswd
    log "Usuario ${APP_USER} creado"
fi

# ── 2. Dependencias del sistema ───────────────────────────────────────────────
info "Instalando dependencias del sistema..."
apt-get update -qq
apt-get install -y -qq \
    git curl wget python3 python3-pip python3-venv \
    build-essential libpq-dev \
    nginx certbot python3-certbot-nginx \
    supervisor 2>/dev/null || true
log "Dependencias instaladas"

# Node.js 20 (si no está)
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 18 ]]; then
    info "Instalando Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
    apt-get install -y -qq nodejs
    log "Node.js $(node -v) instalado"
else
    log "Node.js $(node -v) ya presente"
fi

# PM2 global
if ! command -v pm2 &>/dev/null; then
    info "Instalando PM2..."
    npm install -g pm2 -q
    log "PM2 instalado"
fi

# ── 3. PostgreSQL: crear BD y usuario ─────────────────────────────────────────
info "Configurando PostgreSQL..."
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw risvoice; then
    warn "Base de datos 'risvoice' ya existe"
else
    sudo -u postgres psql -c "CREATE USER risvoice_user WITH PASSWORD '${DB_PASSWORD}';" 2>/dev/null || true
    sudo -u postgres psql -c "CREATE DATABASE risvoice OWNER risvoice_user;" 2>/dev/null || true
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE risvoice TO risvoice_user;"
    log "Base de datos 'risvoice' creada"
fi

# ── 4. Clonar repositorio ─────────────────────────────────────────────────────
info "Clonando repositorio..."
mkdir -p "${APP_DIR}"
chown "${APP_USER}:${APP_USER}" "${APP_DIR}"

# Backend (rama main)
if [[ -d "${BACKEND_DIR}/.git" ]]; then
    warn "Backend ya clonado, actualizando..."
    sudo -u "$APP_USER" git -C "${BACKEND_DIR}" pull
else
    sudo -u "$APP_USER" git clone --depth=1 --branch main "${REPO}" "${BACKEND_DIR}"
fi

# Frontend (rama frontend)
if [[ -d "${FRONTEND_DIR}/.git" ]]; then
    warn "Frontend ya clonado, actualizando..."
    sudo -u "$APP_USER" git -C "${FRONTEND_DIR}" pull
else
    sudo -u "$APP_USER" git clone --depth=1 --branch frontend "${REPO}" "${FRONTEND_DIR}"
fi

log "Repositorio clonado"

# ── 5. Backend: entorno Python ────────────────────────────────────────────────
info "Configurando entorno Python..."
sudo -u "$APP_USER" python3 -m venv "${BACKEND_DIR}/venv"
sudo -u "$APP_USER" "${BACKEND_DIR}/venv/bin/pip" install --quiet --upgrade pip
sudo -u "$APP_USER" "${BACKEND_DIR}/venv/bin/pip" install --quiet \
    fastapi uvicorn[standard] sqlalchemy asyncpg alembic \
    pydantic pydantic-settings python-jose[cryptography] passlib[bcrypt] \
    httpx anthropic redis python-multipart aiofiles pillow weasyprint \
    ulid-py sentence-transformers numpy psycopg2-binary 2>&1 | tail -3

log "Entorno Python listo"

# ── 6. Backend: archivo .env ──────────────────────────────────────────────────
info "Creando .env del backend..."
cat > "${BACKEND_DIR}/.env" <<EOF
ANTHROPIC_API_KEY=REEMPLAZAR_CON_TU_API_KEY
DATABASE_URL=postgresql+asyncpg://risvoice_user:${DB_PASSWORD}@localhost/risvoice
REDIS_URL=redis://localhost:6379
MIRTH_URL=http://localhost:8443/api
WHISPER_URL=http://localhost:8001
FHIR_SERVER_URL=http://localhost:8080/fhir
ORTHANC_URL=
ORTHANC_USER=orthanc
ORTHANC_PASSWORD=orthanc
JWT_SECRET=${JWT_SECRET}
JWT_ALGORITHM=HS256
JWT_ACCESS_TTL_MINUTES=480
JWT_REFRESH_TTL_DAYS=7
CORS_ORIGINS=["https://${DOMAIN}","http://localhost:3020"]
PDF_OUTPUT_DIR=/home/${APP_USER}/app/backend/pdf_storage
APP_ENV=production
INTEGRATION_TOKEN=$(openssl rand -hex 24)
EOF
chown "${APP_USER}:${APP_USER}" "${BACKEND_DIR}/.env"
chmod 600 "${BACKEND_DIR}/.env"
log ".env backend creado"

# ── 7. Backend: migraciones ───────────────────────────────────────────────────
info "Ejecutando migraciones Alembic..."
mkdir -p "${BACKEND_DIR}/pdf_storage"
chown "${APP_USER}:${APP_USER}" "${BACKEND_DIR}/pdf_storage"

cd "${BACKEND_DIR}"
sudo -u "$APP_USER" "${BACKEND_DIR}/venv/bin/python" -c "
import asyncio, sys
sys.path.insert(0, '${BACKEND_DIR}')
from database import engine, Base
from models import user, report, worklist, audit, feedback, clinic_settings
async def create():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
asyncio.run(create())
print('Tablas creadas')
" && log "Tablas creadas en BD"

# ── 8. Servicio systemd para FastAPI ──────────────────────────────────────────
info "Creando servicio systemd risvoice-backend..."
cat > /etc/systemd/system/risvoice-backend.service <<EOF
[Unit]
Description=RIS Voice AI Backend (FastAPI)
After=network.target postgresql.service redis.service

[Service]
Type=exec
User=${APP_USER}
WorkingDirectory=${BACKEND_DIR}
EnvironmentFile=${BACKEND_DIR}/.env
ExecStart=${BACKEND_DIR}/venv/bin/uvicorn main:app --host 127.0.0.1 --port ${BACKEND_PORT} --workers 2
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable risvoice-backend
systemctl restart risvoice-backend
sleep 2
systemctl is-active --quiet risvoice-backend && log "Backend corriendo en puerto ${BACKEND_PORT}" || warn "Backend no iniciado — revisa: journalctl -u risvoice-backend -n 20"

# ── 9. Frontend: build Next.js ────────────────────────────────────────────────
info "Construyendo frontend Next.js..."
cd "${FRONTEND_DIR}"

# .env.local de producción
cat > "${FRONTEND_DIR}/.env.local" <<EOF
NEXT_PUBLIC_API_URL=https://${DOMAIN}
EOF
chown "${APP_USER}:${APP_USER}" "${FRONTEND_DIR}/.env.local"

sudo -u "$APP_USER" npm ci --silent
sudo -u "$APP_USER" npm run build
log "Frontend construido"

# PM2 ecosystem
cat > "${FRONTEND_DIR}/ecosystem.config.js" <<EOF
module.exports = {
  apps: [{
    name: 'risvoice-frontend',
    script: 'node_modules/.bin/next',
    args: 'start -p ${FRONTEND_PORT}',
    cwd: '${FRONTEND_DIR}',
    user: '${APP_USER}',
    env: {
      NODE_ENV: 'production',
      PORT: ${FRONTEND_PORT},
    },
    restart_delay: 3000,
    max_restarts: 10,
  }]
};
EOF
chown "${APP_USER}:${APP_USER}" "${FRONTEND_DIR}/ecosystem.config.js"

sudo -u "$APP_USER" pm2 start "${FRONTEND_DIR}/ecosystem.config.js" 2>/dev/null || \
sudo -u "$APP_USER" pm2 restart risvoice-frontend 2>/dev/null || true

sudo -u "$APP_USER" pm2 save
pm2 startup systemd -u "$APP_USER" --hp "/home/${APP_USER}" 2>/dev/null | grep "sudo" | bash || true
log "Frontend corriendo en puerto ${FRONTEND_PORT}"

# ── 10. Nginx ─────────────────────────────────────────────────────────────────
info "Configurando Nginx para ${DOMAIN} (HTTPS con Origin Certificate)..."

cat > "/etc/nginx/sites-available/${DOMAIN}" <<NGINX
# Redirigir HTTP → HTTPS
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

# HTTPS con Cloudflare Origin Certificate
server {
    listen 443 ssl;
    server_name ${DOMAIN};

    ssl_certificate     ${CF_CERT};
    ssl_certificate_key ${CF_KEY};

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Frontend Next.js
    location / {
        proxy_pass http://127.0.0.1:${FRONTEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 50M;
    }

    # Backend FastAPI
    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 120s;
        client_max_body_size 50M;
    }

    # Documentación FastAPI
    location /docs {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_set_header Host \$host;
    }
}
NGINX

ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"
nginx -t && systemctl reload nginx
log "Nginx configurado con HTTPS (Cloudflare Full Strict)"

# ── 12. Resumen final ─────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}=================================================="
echo "  INSTALACIÓN COMPLETADA"
echo "==================================================${NC}"
echo ""
echo -e "${CYAN}URLs:${NC}"
echo "  Frontend:  https://${DOMAIN}"
echo "  API docs:  https://${DOMAIN}/docs"
echo "  Health:    https://${DOMAIN}/health"
echo ""
echo -e "${CYAN}Servicios:${NC}"
echo "  Backend:  systemctl status risvoice-backend"
echo "  Frontend: pm2 status risvoice-frontend"
echo "  Logs:     journalctl -u risvoice-backend -f"
echo "            pm2 logs risvoice-frontend"
echo ""
echo -e "${YELLOW}PENDIENTE:${NC}"
echo "  1. Agregar ANTHROPIC_API_KEY en el .env:"
echo "     nano ${BACKEND_DIR}/.env"
echo "     systemctl restart risvoice-backend"
echo ""
echo "  2. Verificar en Cloudflare: SSL/TLS → Overview = Full Strict ✔"
echo ""
echo "  3. Crear primer usuario admin:"
echo "     curl -X POST https://${DOMAIN}/api/v1/admin/users \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"rut\":\"12345678-9\",\"email\":\"admin@dmcprojects.cl\","
echo "            \"full_name\":\"Administrador\",\"role\":\"ADMIN\","
echo "            \"password\":\"CambiarEsto2024!\"}'"
echo ""
echo -e "${GREEN}Sistema RIS Voice AI listo.${NC}"
