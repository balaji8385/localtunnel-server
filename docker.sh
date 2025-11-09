docker run -d \
    --restart always \
    --name triotunnel \
    --net host \
    -p 3000:3000 \
    -e DOMAIN=example.com \
    -e SECURE=true \
    triotunnel-server