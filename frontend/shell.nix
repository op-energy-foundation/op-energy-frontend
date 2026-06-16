let
  stable = import ./nixpkgs.nix;
  pkgs = import stable
    { };
in
pkgs.mkShell {
  buildInputs = with pkgs; [ curl jq python3 nodejs ];
}
