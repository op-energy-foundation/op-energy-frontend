{ GIT_COMMIT_HASH}:
{config, pkgs, options, lib, ...}@args:
let
  op-energy-source = ../.;
  op-energy-overlay = (import ./overlay.nix) { GIT_COMMIT_HASH = GIT_COMMIT_HASH; };

  cfg = config.services.op-energy-frontend;
  frontend_args = {
    testnet_enabled = cfg.testnet_enabled;
    signet_enabled = cfg.signet_enabled;
  };
in
{
  options.services.op-energy-frontend = {
    enable = lib.mkEnableOption "op-energy service";
    mainnet_api_host = lib.mkOption {
      type = if lib.types ? "string"
        then lib.types.string
        else lib.types.str;
      example = "http://127.0.0.1:8999";
      default = "http://127.0.0.1:8999";
      description = ''
        Defines mainnet API host location, in case if enabled
      '';
    };
    testnet_enabled = lib.mkOption {
      type = lib.types.bool;
      example = false;
      default = false;
      description = ''
        If enabled, frontend will have a dropdown list, from which it will be possible to switch to testnet network
      '';
    };
    testnet_api_host = lib.mkOption {
      type = if lib.types ? "string"
        then lib.types.string
        else lib.types.str;
      example = "http://127.0.0.1:8997";
      default = "http://127.0.0.1:8997";
      description = ''
        Defines testnet API host location, in case if enabled
      '';
    };
    signet_enabled = lib.mkOption {
      type = lib.types.bool;
      example = false;
      default = false;
      description = ''
        If enabled, frontend will have a dropdown list, from which it will be possible to switch to signet network
      '';
    };
    signet_api_host = lib.mkOption {
      type = if lib.types ? "string"
        then lib.types.string
        else lib.types.str;
      example = "http://127.0.0.1:8995";
      default = "http://127.0.0.1:8995";
      description = ''
        Defines signet API host location, in case if enabled
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    nixpkgs.overlays = [
      op-energy-overlay # add op-energy-frontend into context
    ];
    environment.systemPackages = with pkgs; [
      (op-energy-frontend frontend_args)
    ];
    services.nginx =
      let
        testnet_locations =
          if cfg.testnet_enabled
          then ''
            location = /testnet/api {
              try_files $uri $uri/ /en-US/index.html =404;
            }
            location = /testnet/api/ {
              try_files $uri $uri/ /en-US/index.html =404;
            }
            # testnet API
            location /testnet/api/v1/ws {
              proxy_pass ${cfg.testnet_api_host}/api/v1/ws;
              proxy_http_version 1.1;
              proxy_set_header Upgrade $http_upgrade;
              proxy_set_header Connection "Upgrade";
            }
            location /testnet/api/v1 {
              proxy_pass $(cfg.testnet_api_host)/api/v1;
            }
            location /testnet/api {
              proxy_pass $(cfg.testnet_api_host)/api/v1;
            }
          ''
        else ''
        '';
        signet_locations =
          if cfg.signet_enabled
          then ''
            location = /signet/api {
              try_files $uri $uri/ /en-US/index.html =404;
            }
            location = /signet/api/ {
              try_files $uri $uri/ /en-US/index.html =404;
            }
            # signet API
            location /signet/api/v1/ws {
              proxy_pass ${cfg.signet_api_host}/api/v1/ws;
              proxy_http_version 1.1;
              proxy_set_header Upgrade $http_upgrade;
              proxy_set_header Connection "Upgrade";
            }
            location /signet/api/v1 {
              proxy_pass ${cfg.signet_api_host}/api/v1;
            }
            location /signet/api {
              proxy_pass ${cfg.signet_api_host}/api/v1;
            }
          ''
        else ''
        '';
      in {
      enable = true;
      appendConfig = ''
        worker_processes auto;
        worker_rlimit_nofile 100000;
      '';
      eventsConfig = ''
        worker_connections 9000;
        multi_accept on;
      '';
      serverTokens = false;
      clientMaxBodySize = "10m";
      commonHttpConfig = ''
        sendfile on;
        tcp_nopush on;
        tcp_nodelay on;

        server_name_in_redirect off;



        # reset timed out connections freeing ram
        reset_timedout_connection on;
        # maximum time between packets the client can pause when sending nginx any data
        client_body_timeout 10s;
        # maximum time the client has to send the entire header to nginx
        client_header_timeout 10s;
        # timeout which a single keep-alive client connection will stay open
        keepalive_timeout 69s;
        # maximum time between packets nginx is allowed to pause when sending the client data
        send_timeout 69s;

        # number of requests per connection, does not affect SPDY
        keepalive_requests 1337;

        # enable gzip compression
        gzip on;
        gzip_vary on;
        gzip_comp_level 6;
        gzip_min_length 1000;
        gzip_proxied expired no-cache no-store private auth;
        # text/html is always compressed by gzip module
        gzip_types application/javascript application/json application/ld+json application/manifest+json application/x-font-ttf application/x-web-app-manifest+json application/xhtml+xml application/xml font/opentype image/bmp image/svg+xml image/x-icon text/cache-manifest text/css text/plain text/vcard;

        # limit request body size

        # proxy cache
        proxy_cache off;
        proxy_cache_path /var/cache/nginx keys_zone=cache:20m levels=1:2 inactive=600s max_size=500m;

        # exempt localhost from rate limit
        geo $limited_ip {
                default         1;
                127.0.0.1       0;
        }
        map $limited_ip $limited_ip_key {
                1 $binary_remote_addr;
                0 \'\';
        }

        # rate limit requests
        limit_req_zone $limited_ip_key zone=api:5m rate=200r/m;
        limit_req_status 429;

        # rate limit connections
        limit_conn_zone $limited_ip_key zone=websocket:10m;
        limit_conn_status 429;

        map $http_accept_language $header_lang {
                default en-US;
                ~*^en-US en-US;
                ~*^en en-US;
        }

        map $cookie_lang $lang {
                default $header_lang;
                ~*^en-US en-US;
                ~*^en en-US;
        }

        server {
                listen 127.0.0.1:80;
        }
      '';
      virtualHosts.op-energy = {
        root = "${pkgs.op-energy-frontend frontend_args}";
        extraConfig = ''
          index index.html;

          # enable browser and proxy caching
          add_header Cache-Control "public, no-transform";
          add_header 'Access-Control-Allow-Origin' '*' always;

          # vary cache if user changes language preference
          add_header Vary Accept-Language;
          add_header Vary Cookie;

          # fallback for all URLs i.e. /address/foo /tx/foo /block/000
          location / {
                  try_files /$lang/$uri /$lang/$uri/ $uri $uri/ /en-US/$uri @index-redirect;
                  expires 10m;
          }
          location @index-redirect {
                  rewrite (.*) /$lang/index.html;
          }

          # location block using regex are matched in order

          # used for cookie override
          location ~ ^/(ar|bg|bs|ca|cs|da|de|et|el|es|eo|eu|fa|fr|gl|ko|hr|id|it|he|ka|lv|lt|hu|mk|ms|nl|ja|nb|nn|pl|pt|pt-BR|ro|ru|sk|sl|sr|sh|fi|sv|th|tr|uk|vi|zh|hi)/ {
                  try_files $uri $uri/ /$1/index.html =404;
          }

          # static API docs
          location = /api {
                  try_files $uri $uri/ /en-US/index.html =404;
          }
          location = /api/ {
                  try_files $uri $uri/ /en-US/index.html =404;
          }
          location /api/v1/ws {
                  proxy_pass ${cfg.mainnet_api_host}/api/v1/ws;
                  proxy_http_version 1.1;
                  proxy_set_header Upgrade $http_upgrade;
                  proxy_set_header Connection "Upgrade";
                  limit_conn websocket 100;
          }
          location /api/v2/blockspans {
                  limit_req zone=api burst=10 nodelay;
                  proxy_pass ${cfg.mainnet_api_host}/api/v2/blockspans;
          }
          location /api/v2/blockspans/ws {
                  proxy_pass ${cfg.mainnet_api_host}/api/v2/blockspans/ws;
                  proxy_http_version 1.1;
                  proxy_set_header Upgrade $http_upgrade;
                  proxy_set_header Connection "Upgrade";
                  limit_conn websocket 100;
          }
          location /api/v1 {
                  limit_req zone=api burst=10 nodelay;
                  proxy_pass ${cfg.mainnet_api_host}/api/v1;
          }
          location /api/ {
                  limit_req zone=api burst=10 nodelay;
                  proxy_pass ${cfg.mainnet_api_host}/api/v1/;
          }

 
          # here we include possible options to route testnet-related requests.
          ${testnet_locations}
          # here we include possible options to route signet-related requests.
          ${signet_locations}
        '';
      };
    };
  };
}

