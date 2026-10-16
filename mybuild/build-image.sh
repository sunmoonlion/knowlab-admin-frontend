#!/bin/bash

# Knowlab App SSR 镜像构建脚本
# 用法: ./build-image.sh [--tag TAG]
#   根据 build.conf 中的 PUSH_IMAGES_AFTER_BUILD 配置决定是否推送镜像

set -e

# 脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $1"
}

# 加载构建配置
BUILD_CONF="${SCRIPT_DIR}/build.conf"
if [ -f "$BUILD_CONF" ]; then
    log_info "加载构建配置: $BUILD_CONF"
    # shellcheck source=/dev/null
    source "$BUILD_CONF"
    source "$SCRIPT_DIR/release-tag.sh"
    candidate_tag="${KNOWLAB_SSR_TAG:-architecture-v2-dev}"
    if [[ "${1:-}" == "--tag" && -n "${2:-}" ]]; then candidate_tag="$2"; fi
    require_development_tag "$candidate_tag" || exit 1
    source "$SCRIPT_DIR/harbor-cluster.sh"
REGISTRY="$(resolve_k8s_images_registry)" || exit 1
export REGISTRY
else
    log_error "构建配置文件不存在: $BUILD_CONF"
    exit 1
fi

# 镜像配置（从 build.conf 读取）
KNOWLAB_SSR_IMAGE="${KNOWLAB_SSR_IMAGE:-knowlab-admin-frontend}"
KNOWLAB_SSR_TAG="${KNOWLAB_SSR_TAG:-architecture-v2-dev}"

# 镜像仓库配置（从 build.conf 读取）
KNOWLAB_SSR_IMAGE_REGISTRY="${KNOWLAB_SSR_IMAGE_REGISTRY:-harbor.sunmoonai.com}"
KNOWLAB_SSR_IMAGE_PROJECT="${KNOWLAB_SSR_IMAGE_PROJECT:-app-images}"

# 构建选项
DOCKERFILE="${DOCKERFILE:-Dockerfile}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"

# 容器运行时配置（从 build.conf 读取）
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-docker}"

# 根据配置设置运行时命令
if [[ "$CONTAINER_RUNTIME" == "sudo nerdctl" || "$CONTAINER_RUNTIME" == "nerdctl" ]]; then
    # nerdctl 命名空间配置（从 build.conf 读取）
    NERDCTL_NAMESPACE="${NERDCTL_NAMESPACE:-k8s.io}"
    RUNTIME_CMD="sudo nerdctl -n ${NERDCTL_NAMESPACE}"
    log_info "使用容器运行时: sudo nerdctl"
    log_info "nerdctl 命名空间: ${NERDCTL_NAMESPACE}"
    # 检查 nerdctl 是否可用
    if ! command -v nerdctl &> /dev/null; then
        log_error "nerdctl 未安装或不在 PATH 中"
        exit 1
    fi
else
    RUNTIME_CMD="docker"
    log_info "使用容器运行时: docker"
    # 检查 docker 是否可用
    if ! command -v docker &> /dev/null; then
        log_error "docker 未安装或不在 PATH 中"
        exit 1
    fi
fi

# 解析参数
CUSTOM_TAG=""

# 解析自定义标签
if [[ "$1" == "--tag" && -n "$2" ]]; then
    CUSTOM_TAG="$2"
    KNOWLAB_SSR_TAG="$CUSTOM_TAG"
    log_info "使用自定义标签: $KNOWLAB_SSR_TAG"
fi

# 镜像推送配置（从 build.conf 读取）
PUSH_IMAGES_AFTER_BUILD="${PUSH_IMAGES_AFTER_BUILD:-false}"
DOCKER_BUILD_NETWORK="${DOCKER_BUILD_NETWORK:-}"
BUILD_HTTP_PROXY="${BUILD_HTTP_PROXY:-}"
BUILD_HTTPS_PROXY="${BUILD_HTTPS_PROXY:-}"
BUILD_NO_PROXY="${BUILD_NO_PROXY:-}"

# 获取项目根目录（构建上下文）
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="${SOURCE_DIR:-app}"

ensure_base_image() {
    local public_image="$1"
    local harbor_image="${REGISTRY}/${public_image}"
    log_info "检查基础镜像: ${harbor_image}"
    if $RUNTIME_CMD image inspect "${harbor_image}" > /dev/null 2>&1; then
        log_info "本地基础镜像已就绪: ${harbor_image}"
        return 0
    fi
    if $RUNTIME_CMD pull "${harbor_image}" > /dev/null 2>&1; then
        log_info "基础镜像已就绪: ${harbor_image}"
    else
        log_error "Harbor 中不存在基础镜像: ${harbor_image}"
        log_error "请先将该镜像推送到 Harbor，参考 k8s 目录下的镜像推送脚本"
        exit 1
    fi
}

# 检查源代码目录
if [ ! -d "$PROJECT_ROOT/$SOURCE_DIR" ]; then
    log_error "源代码目录不存在: $PROJECT_ROOT/$SOURCE_DIR"
    exit 1
fi

# 检查 Dockerfile
if [ ! -f "$SCRIPT_DIR/$DOCKERFILE" ]; then
    log_error "Dockerfile 不存在: $SCRIPT_DIR/$DOCKERFILE"
    exit 1
fi

# 构建镜像
build_image() {
    log_info "开始构建镜像..."
    log_info "镜像名称: ${KNOWLAB_SSR_IMAGE}:${KNOWLAB_SSR_TAG}"
    log_info "Dockerfile: $SCRIPT_DIR/$DOCKERFILE"
    log_info "构建上下文: $PROJECT_ROOT (项目根目录)"
    
    # 切换到项目根目录（构建上下文）
    cd "$PROJECT_ROOT"
    
    # 构建镜像（构建上下文是项目根目录，Dockerfile 在 mybuild/ 目录）
    local build_network_args=()
    local build_proxy_args=()
    if [ -n "$DOCKER_BUILD_NETWORK" ]; then
        build_network_args=(--network "$DOCKER_BUILD_NETWORK")
        log_info "Docker build 网络模式: $DOCKER_BUILD_NETWORK"
    fi
    if [ -n "$BUILD_HTTP_PROXY" ]; then
        build_proxy_args+=(
            --build-arg "HTTP_PROXY=$BUILD_HTTP_PROXY"
            --build-arg "http_proxy=$BUILD_HTTP_PROXY"
        )
    fi
    if [ -n "$BUILD_HTTPS_PROXY" ]; then
        build_proxy_args+=(
            --build-arg "HTTPS_PROXY=$BUILD_HTTPS_PROXY"
            --build-arg "https_proxy=$BUILD_HTTPS_PROXY"
        )
    fi
    if [ -n "$BUILD_NO_PROXY" ]; then
        build_proxy_args+=(
            --build-arg "NO_PROXY=$BUILD_NO_PROXY"
            --build-arg "no_proxy=$BUILD_NO_PROXY"
        )
    fi
    if [ "${#build_proxy_args[@]}" -gt 0 ]; then
        log_info "Docker build 使用显式构建代理（不会进入运行镜像）"
    fi

    $RUNTIME_CMD build "${build_network_args[@]}" "${build_proxy_args[@]}" -f "$SCRIPT_DIR/$DOCKERFILE" \
        -t "${KNOWLAB_SSR_IMAGE}:${KNOWLAB_SSR_TAG}" \
        --build-arg REGISTRY="${REGISTRY}" \
        --build-arg NODE_IMAGE="${REGISTRY}/node:24.18.0-alpine@sha256:4ba75f835bb8802193e4c114572113d4b26f95f6f094f4b5229d2a77773e0afc" \
        --build-arg NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY:-https://registry.npmmirror.com}" \
        .
    
    if [ $? -eq 0 ]; then
        log_success "镜像构建完成: ${KNOWLAB_SSR_IMAGE}:${KNOWLAB_SSR_TAG}"
        echo ""
        log_info "镜像信息:"
        $RUNTIME_CMD images "${KNOWLAB_SSR_IMAGE}:${KNOWLAB_SSR_TAG}"
        
        # 根据配置决定是否推送
        if [[ "${PUSH_IMAGES_AFTER_BUILD}" == "true" ]]; then
            log_info "PUSH_IMAGES_AFTER_BUILD=true，开始推送镜像..."
            push_image
            log_success "✅ 镜像构建并推送完成！"
        else
            log_info "PUSH_IMAGES_AFTER_BUILD=false，跳过推送"
            log_info "提示: 如需推送镜像，请在 build.conf 中设置 PUSH_IMAGES_AFTER_BUILD=true"
        fi
    else
        log_error "镜像构建失败"
        exit 1
    fi
    
    cd - > /dev/null
}

# 推送镜像
push_image() {
    log_info "推送镜像到镜像仓库..."
    
    # 构建完整镜像名称
    local push_registry
    push_registry="$(resolve_harbor_registry_for_push "${KNOWLAB_SSR_IMAGE_REGISTRY:-harbor.sunmoonai.com}")"
    KNOWLAB_SSR_FULL_IMAGE_NAME="${push_registry}/${KNOWLAB_SSR_IMAGE_PROJECT}/${KNOWLAB_SSR_IMAGE}:${KNOWLAB_SSR_TAG}"
    
    log_info "完整镜像名称: $KNOWLAB_SSR_FULL_IMAGE_NAME"
    
    # 检查本地镜像是否存在
    if ! $RUNTIME_CMD images | grep -q "${KNOWLAB_SSR_IMAGE}.*${KNOWLAB_SSR_TAG}"; then
        log_error "本地镜像不存在: ${KNOWLAB_SSR_IMAGE}:${KNOWLAB_SSR_TAG}"
        log_info "请先构建镜像: ./build-image.sh"
        exit 1
    fi
    
    # 标记镜像
    $RUNTIME_CMD tag "${KNOWLAB_SSR_IMAGE}:${KNOWLAB_SSR_TAG}" "$KNOWLAB_SSR_FULL_IMAGE_NAME"
    
    # 推送镜像
    if push_image_with_harbor_verify "$RUNTIME_CMD" "$KNOWLAB_SSR_FULL_IMAGE_NAME"; then
        log_success "✅ 镜像推送成功: $KNOWLAB_SSR_FULL_IMAGE_NAME"
    else
        log_error "❌ 镜像推送失败: $KNOWLAB_SSR_FULL_IMAGE_NAME"
        log_info "请检查："
        log_info "  1. 镜像仓库配置是否正确"
        if [[ "$RUNTIME_CMD" == "docker" ]]; then
            log_info "  2. 是否已登录镜像仓库（docker login ${KNOWLAB_SSR_IMAGE_REGISTRY}）"
        else
            log_info "  2. 是否已登录镜像仓库（sudo nerdctl login ${KNOWLAB_SSR_IMAGE_REGISTRY}）"
        fi
        log_info "  3. 网络连接是否正常"
        exit 1
    fi
}

# 主函数
main() {
    log_info "Knowlab App SSR 镜像构建脚本启动"
    log_info "推送配置: PUSH_IMAGES_AFTER_BUILD=${PUSH_IMAGES_AFTER_BUILD}"
    ensure_base_image "node:24.18.0-alpine"
    build_image
}

# 执行主函数
main "$@"
