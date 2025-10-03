export const install = `
#!/bin/sh
# This script is used to install tmux on the system.
set -e

# Check if tmux is already installed
if command -v tmux >/dev/null 2>&1; then
    # echo "tmux is already installed at $(command -v tmux)"
    exit 0
fi

install_tmux_linux() {
    # Source os-release for distro identification
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        case "$ID" in
            ubuntu|debian)
                sudo apt-get update && sudo apt-get install -y tmux
                ;;
            fedora)
                sudo dnf install -y tmux
                ;;
            centos|rhel)
                sudo yum install -y tmux
                ;;
            arch)
                sudo pacman -Sy --noconfirm tmux
                ;;
            opensuse*|suse)
                sudo zypper install -y tmux
                ;;
            alpine)
                sudo apk add tmux
                ;;
            *)
                echo "Unknown or unsupported Linux distribution: $ID"
                return 1
                ;;
        esac
    else
        echo "Cannot detect Linux distribution (missing /etc/os-release)"
        return 1
    fi
}

install_tmux_macos() {
    if command -v brew >/dev/null 2>&1; then
        brew install tmux
    elif command -v port >/dev/null 2>&1; then
        sudo port install tmux
    else
        echo "No supported package manager found (brew/port) for macOS"
        return 1
    fi
}

install_tmux_bsd() {
    if command -v pkg >/dev/null 2>&1; then
        sudo pkg install -y tmux
    else
        echo "No supported package manager found (pkg) for BSD"
        return 1
    fi
}

main() {
    uname_s=$(uname -s)
    case "$uname_s" in
        Linux)
            if install_tmux_linux; then
                echo "tmux installed using Linux system package manager."
            else
                echo "Failed to install tmux on Linux."
                exit 1
            fi
            ;;
        Darwin)
            if install_tmux_macos; then
                echo "tmux installed using macOS package manager."
            else
                echo "Failed to install tmux on macOS."
                exit 1
            fi
            ;;
        FreeBSD|OpenBSD|NetBSD|DragonFly)
            if install_tmux_bsd; then
                echo "tmux installed using BSD package manager."
            else
                echo "Failed to install tmux on BSD."
                exit 1
            fi
            ;;
        *)
            echo "Unsupported OS: $uname_s"
            exit 1
            ;;
    esac
}

main
`;
