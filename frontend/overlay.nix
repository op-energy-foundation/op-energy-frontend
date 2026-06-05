{ GIT_COMMIT_HASH }: self: super:
let
  stable = import ./nixpkgs.nix;
  pkgs = import stable {
    config = {};
    overlays = [ ];
  };
  args1 = {
    GIT_COMMIT_HASH = GIT_COMMIT_HASH;
    pkgs = pkgs;
  };
in {
  op-energy-frontend = (pkgs.callPackage ./derivation.nix args1).op-energy-frontend;
}
