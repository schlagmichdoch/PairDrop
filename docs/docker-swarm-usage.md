# Docker Swarm Usage

## Healthcheck

The [Docker Image](../Dockerfile) includes a Healthcheck with the following options:

```
--interval=30s
```
> Specifies the time interval at which the health check should be performed. In this case, the health check will be performed every 30 seconds.

<br>

```
--timeout=10s
```
> Specifies the amount of time to wait for a response from the health check command. If the response does not arrive within 10 seconds, the health check will be considered a failure.

<br>

```
--start-period=5s
```
> Specifies the amount of time to wait before starting the health check process. In this case, the health check process will begin 5 seconds after the container is started.

<br>

```
--retries=3
```
> Specifies the number of times Docker should retry the health check before considering the container to be unhealthy.

<br>


The CMD instruction is used to define the command that will be run as part of the health check. 
In this case, the command is `wget --quiet --tries=1 --spider http://localhost:3000/ || exit 1`. This command will attempt to connect to `http://localhost:3000/` 
and if it fails it will exit with a status code of `1`. If this command returns a status code other than `0`, the health check will be considered a failure.

Overall, this HEALTHCHECK instruction is defining a health check process that will run every 30 seconds, wait up to 10 seconds for a response, 
begin 5 seconds after the container is started, and retry up to 3 times. 
The health check will consist of attempting to connect to http://localhost:3000/ and will consider the container to be unhealthy if it is unable to connect.

