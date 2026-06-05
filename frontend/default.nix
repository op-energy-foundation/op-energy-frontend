let
  stable = import ./nixpkgs.nix;
  pkgs1 = import stable {
    config = {};
    overlays = [
    ];
  };
  sourceWithGit = pkgs1.copyPathToStore ../.;
  GIT_COMMIT_HASH = builtins.readFile ( # if git commit is empty, then try to get it from git
    pkgs1.runCommand "get-rev" {
      nativeBuildInputs = [ pkgs1.git ];
    } ''
      HASH=$(GIT_DIR=${sourceWithGit}/.git git rev-parse --short HEAD | tr -d '\n' || printf 'NOT A GIT REPO')
      printf $HASH > $out
    ''
  );
  overlay = (import ./overlay.nix) { GIT_COMMIT_HASH = GIT_COMMIT_HASH; };
  pkgs = import stable {
    config = {};
    overlays = [
      overlay
    ];
  };
in pkgs.op-energy-frontend
