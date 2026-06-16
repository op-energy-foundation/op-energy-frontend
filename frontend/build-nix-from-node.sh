set -x
set -e

node2nix -d -i ./package.json -l ./package-lock.json -o frontend-node-packages.nix -c frontend.nix -e frontend-node-env.nix

cat frontend-node-env.patch | patch -p1
sed -i 's/sources."nice-napi-1.0.2"/(sources."nice-napi-1.0.2" \/\/ { dependencies = [ sources."node-gyp-build-4.6.0" ]; } )/' ./frontend-node-packages.nix
sed -i 's/<nixpkgs>/(import ./nixpkgs.nix)/' ./frontend.nix
