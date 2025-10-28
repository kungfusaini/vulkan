#!/bin/sh

# Run validation first
node -e "require('./validate-env')"

if [ "$GEN_MAIL_CREDS" = "true" ]; then
    echo "Generating fresh Ethereal credentials..."
    node gen-etheral.js
fi

exec node app.js