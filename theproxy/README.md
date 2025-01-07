# for a doorway in the cloud

Caddy must reside where your public IP is.

## firewalling

```
# docker daemon doesn't need 
sudo ufw delete allow 2375/tcp
sudo ufw delete allow 2376/tcp
sudo ufw delete allow 2375/tcp v6
sudo ufw delete allow 2376/tcp v6
# public address
sudo ufw allow 443/tcp
# backstage ssh
sudo ufw allow 2023/tcp
```

## ssh reverse-tunnel for the reverse-proxy

`ssh -R 3000:localhost:9090 -p 2023 d`

And you should have it!


# but



```
root@docker-s-1vcpu-1gb-syd1-01:~# docker ps
CONTAINER ID   IMAGE                 COMMAND                  CREATED          STATUS         PORTS                                                              NAMES
8d0ee5e2542a   theproxy-caddy        "caddy run --config …"   6 minutes ago    Up 6 minutes   80/tcp, 2019/tcp, 443/udp, 0.0.0.0:443->443/tcp, :::443->443/tcp   theproxy-caddy-1
f243d7d42517   theproxy-ssh-tunnel   "/usr/sbin/sshd -D -…"   25 minutes ago   Up 6 minutes   0.0.0.0:2023->2023/tcp, :::2023->2023/tcp                          theproxy-ssh-tunnel-1
root@docker-s-1vcpu-1gb-syd1-01:~# ufw status
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     LIMIT       Anywhere                  
443/tcp                    ALLOW       Anywhere                  
2023/tcp                   ALLOW       Anywhere                  
22/tcp (v6)                LIMIT       Anywhere (v6)             
443/tcp (v6)               ALLOW       Anywhere (v6)             
2023/tcp (v6)              ALLOW       Anywhere (v6)             

```


