#!/usr/bin/with-contenv bashio

# Ensure persistent data directory exists
mkdir -p /data

# Seed compute_config.json from options on first run (if compute URL is provided)
if bashio::config.has_value 'compute_remote_url'; then
    compute_url="$(bashio::config 'compute_remote_url')"
    if [ -n "${compute_url}" ] && [ ! -f /data/compute_config.json ]; then
        bashio::log.info "Seeding compute config: remote at ${compute_url}"
        printf '{"mode":"remote","remote_url":"%s","remote_urls":["%s"]}' \
            "${compute_url}" "${compute_url}" > /data/compute_config.json
    fi
fi
