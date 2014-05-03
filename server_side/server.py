#!/usr/bin/env python
# coding: utf8

#
# This file is part of monitor_it.
# 
# monitor_it is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# any later version.
# 
# monitor_it is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
# 
# You should have received a copy of the GNU General Public License
# along with monitor_it.  If not, see <http://www.gnu.org/licenses/>.
#

# 
# This server produces a JSON file like this one with all statistics included :
# ---------------------------------------------------------
# {
#     "load": [0.37, 0.32, 0.3],
#     "disk": [
#                 {name: "sda", data: [23509, 42145, 414560, 973550]}
#             ], 
#     "mem": 50.5, 
#     "net": [
#                 {name: "wlan0", data: [703716548, 50409025]}, 
#                 {name: "eth0", data: [0, 0]}
#            ],
#     "cpu": 20.0
# }
# ---------------------------------------------------------
# 
# Keys to access properties are "load", "mem", "disk", "net" and "cpu" (note that the order can change).
# 

import sys
import socket
import signal
import json
import subprocess
import random
import time
import threading

##############################
# Things to modify are below #
##############################
# IP to listen on
LISTEN_IP = '0.0.0.0'
# Port to linsten on
PORT_NO = 8080
# maximum number of queued connections
MAX_QUEUED_CO = 3

# List of network interfaces
NETWORK_INTERFACES = ["wlan0", "eth0", "tun0"]

# List of disks/volumes
DISKS = ["sda"]

# Interval used for network and cpu computation
SAMPLE_INTERVAL = 2

##########################
# Nothing more to modify #
##########################

ERROR_str = "[-] "
SUCCESS_str = "[+] "
server_sock = None
cpu_last = None
thread_cpu = None
thread_network = None
ifaces_nb_bytes_last = []
ifaces_bps_last = []
continue_threads_loops = True

def disk_stats():
    """Aggregate disks statistics"""
    list_disks_stats = []
    for i in DISKS:
        try:
            disk_file = open("/sys/block/" + i + "/stat", 'rU')
            lines = disk_file.readlines()
            disk_file.close()
            content = lines[0].split()
            list_disks_stats.append({"name": i,
                                     "data": (int(content[0]), # nb reads
                                            int(content[4]),  # nb writes
                                            int(content[3]),  # time spent reading
                                            int(content[7])   # time spent writing
                                            )})
        except FileNotFoundError:
            print(ERROR_str + "Disk " + i + " can't be found, removing it from the list")
            DISKS.remove(i)

    return list_disks_stats

def network_iface_nb_bytes(iface_name):
    net_in_file = open("/sys/class/net/" + iface_name + "/statistics/rx_bytes", 'rU')
    net_in_content = int((net_in_file.readlines())[0].split()[0])
    net_in_file.close()
    net_out_file = open("/sys/class/net/" + iface_name + "/statistics/tx_bytes", 'rU')
    net_out_content = int((net_out_file.readlines())[0].split()[0])
    net_out_file.close()
    return (net_in_content, net_out_content)

def network_stats():
    """Aggregate network interfaces statistics"""
    list_net_stats = []
    for i in NETWORK_INTERFACES:
        try:
            (net_in_content, net_out_content) = network_iface_nb_bytes(i)
            list_net_stats.append({"name": i, "data": (net_in_content, # nb bytes received
                                                       net_out_content # nb bytes transmitted
                                                       )})
        except FileNotFoundError:
            print(ERROR_str + "Interface " + i + " can't be found, removing it from the list")
            NETWORK_INTERFACES.remove(i)

    return list_net_stats


def network_stats_refresh():
    net_stats = network_stats()
    for i in range(len(net_stats)):
        (nb_bytes_in, nb_bytes_out) = (net_stats[i])['data']
        (nb_bytes_in_last, nb_bytes_out_last) = ifaces_nb_bytes_last[i]

        bps_in = (nb_bytes_in - nb_bytes_in_last) / SAMPLE_INTERVAL
        bps_out = (nb_bytes_out - nb_bytes_out_last) / SAMPLE_INTERVAL
        
        ifaces_nb_bytes_last[i] = (nb_bytes_in, nb_bytes_out)
        ifaces_bps_last[i] = (bps_in, bps_out)

def format_network_stats():
    ret = []
    for j in range(len(ifaces_bps_last)):
        (i, o) = ifaces_bps_last[j]
        ret.append({"name": NETWORK_INTERFACES[j], "data": [i, o]})

    return ret

def start_network_stat_loop():
    global continue_threads_loops
    if continue_threads_loops:
        thread_network = threading.Timer(SAMPLE_INTERVAL, start_network_stat_loop)
        thread_network.start()
        network_stats_refresh()
        thread_network.join()
    else:
        print(ERROR_str + "Network thread finished.")

def loadavg_stats():
    """Aggregate system load's statistics (average)"""
    loadavg_file = open("/proc/loadavg", "rU")
    loadavg_line = loadavg_file.readlines()[0].split()
    loadavg_file.close()
    loadavg_content = []
    for i in loadavg_line[:3]:
        loadavg_content.append(float(i))
    return loadavg_content

def memory_stats():
    """Aggregate memory statistics"""
    p = subprocess.Popen("free", stdout=subprocess.PIPE, shell=True)
    (output, err) = p.communicate()
    l = output.split()
    index_used = l.index(b'Mem:') + 2
    p_mem_used = float((int(l[index_used]) * 100) / int(l[index_used-1]))
    return p_mem_used

def cpu_stat_list():
    statFile = open("/proc/stat", "rU")
    timeList = statFile.readline().split(" ")[2:6]
    statFile.close()
    for i in range(len(timeList)):
        timeList[i] = int(timeList[i])
    return timeList

def cpu_stat_refresh(cpu_last_arg):
    y = cpu_stat_list()
    for i in range(len(y)):
        y[i] -= cpu_last_arg[i]
    cpu_last = y
    return y

def cpu_stats():
    global cpu_last_percentage
    dt = cpu_stat_refresh(cpu_last)
    cpu_last_percentage = float(100 - (dt[len(dt)-1] * 100.00 / sum(dt)))


def start_cpu_stat_loop():
    global continue_threads_loops
    if continue_threads_loops:
        thread_cpu = threading.Timer(SAMPLE_INTERVAL, start_cpu_stat_loop)
        thread_cpu.start()
        cpu_stats()
        thread_cpu.join()
    else:
        print(ERROR_str + "CPU thread finished.")

def get_cpu_last_percentage():
    return cpu_last_percentage

def normalize_line_endings(s):
    """Convert string containing various line endings like \n, \r or \r\n,
    to uniform \n."""

    return ''.join((line + '\n') for line in s.splitlines())

def run_http_server():
    server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP)
    try:
        server_sock.bind((LISTEN_IP, PORT_NO))
        print(SUCCESS_str + "Server started listening at " + LISTEN_IP + ":" + str(PORT_NO))
    except Exception as e:
        print(ERROR_str + "Address already in use")
        raise e
        sys.exit(1)
    server_sock.listen(MAX_QUEUED_CO)

    while True:
        client_sock, client_addr = server_sock.accept()

        request_data = client_sock.recv(1024)
        request_head = normalize_line_endings(request_data.decode('ascii'))

        request_method, request_uri = request_head.split(' ')[:2]

        response = "HTTP/1.1 "

        # If you send 'bad content' as a request, you will have a little present!
        if request_method != "GET" or request_uri != "/":
            crazy_http_codes = [101, 201, 204, 207, 301, 401, 402, 406, 408, 409,
                                410, 410, 411, 414, 416, 417, 418, 422, 423, 426,
                                429, 431, 444, 450, 502, 503, 509, 599]
            random_http_code = random.sample(crazy_http_codes, 1)[0]
            response += ''.join(str(random_http_code))
        else:
            response_body = json.dumps({"disk": disk_stats(),    "net": format_network_stats(), 
                                        "load": loadavg_stats(), "mem": memory_stats(),
                                        "cpu" : get_cpu_last_percentage() })

            response_headers = {
                'Content-Type': 'text/html; encoding=utf8',
                'Content-Length': len(response_body),
                'Connection': 'close',
                'Access-Control-Allow-Origin': '*',
            }

            response += "200 OK\n"
            response += "".join('%s: %s\n' % (key, response_headers[key]) for key in list(response_headers.keys()))
            response += "\n" + response_body

        client_sock.send(response.encode())
        client_sock.close()

def shutdown(sig, dummy):
    """Shut down the server"""
    global continue_threads_loops
    print("\r" + ERROR_str + "Closing socket and waiting for threads...")
    try:
        if server_sock != None:
            server_sock.shutdown(server_sock.SHUT_RDWR)
        continue_threads_loops = False
        sys.exit(1)
    except Exception as e:
        print("Warning: could not shut down the socket. Maybe it was already closed?",e)


signal.signal(signal.SIGINT, shutdown)

try:
    # Initialisations
    ## CPU
    cpu_last = cpu_stat_list()
    thread_cpu = threading.Timer(SAMPLE_INTERVAL, start_cpu_stat_loop).start()
    ## Network interfaces
    net_stats = network_stats()
    for i in range(len(net_stats)):
        ifaces_nb_bytes_last.append((0, 0))
        ifaces_bps_last.append((0, 0))
    
    thread_network = threading.Timer(SAMPLE_INTERVAL, start_network_stat_loop).start()

    # Run the server
    run_http_server()

except Exception as e:
    raise e
    print(ERROR_str + "Something bad append... shutting down")
    shutdown(None, None)
    raise e
