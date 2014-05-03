/*
 * This file is part of monitor_it.
 * 
 * monitor_it is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 * 
 * monitor_it is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with monitor_it.  If not, see <http://www.gnu.org/licenses/>.
 */

/*
 * Things to modify are here.
 */
var N = 10;         // ringBuffer's size / sample per chart
var delay = 5000;   // How often ask the server for new data (in miliseconds)
var colors = ["rgb(151, 187, 205)", // blue
              "rgb(242, 196, 72)",  // orange
              "rgb(220, 220, 220)", // grey
              "rgb(88, 233, 88)"    // green
             ];
/*
 * Nothing more to modify below...
 */

/*
 * ringBuffer
 */
function ringBuffer(n) {
    this.tab = new Array(n);
    this.pos = 0;
}
ringBuffer.prototype.get = function (i) {return this.tab[i]; };
ringBuffer.prototype.push = function (v) {
    this.tab[this.pos] = v;
    this.pos = (this.pos + 1) % this.tab.length;
};
ringBuffer.prototype.getAll = function () {
    var ret = new Array(this.tab.length), j = 0, i;
    for (i = this.pos; i < this.tab.length; i++, j++) {
        ret[j] = this.tab[i];
    }
    for (i = 0; i < this.pos; i++, j++) {
        ret[j] = this.tab[i];
    }
    return ret;
};
ringBuffer.prototype.clear = function () {
    $.each(this.tab, function(i, e) {this.tab[i] = null;});
};
ringBuffer.IndexError = {};

/*
 * Create as many ringBuffers with initial values as needed:
 *   json                                             -> returned
 *   [{data: 1; ...}, ..., {data: n, ...}] -> [ringBuffer {1}, ..., ringBuffer {n}]
 * @param json_array    array of records with a data attribute.
 * @return              An array of initialized ringBuffers.
 */
function ringBuffers_from_json(json_array) {
    rbs = [];
    $.each(json_array, function(i, val) {
        rb = new ringBuffer(N);
        rb.push(val);
        rbs.push(rb);
    });
    return rbs;
}
// End ringBuffer

// start chart options
options = {
    scaleOverlay : false,
    scaleOverride : false,
    scaleSteps : null,
    scaleStepWidth : null,
    scaleStartValue : null,
    scaleLineColor : "rgba(0,0,0,.1)",
    scaleLineWidth : 1,
    scaleShowLabels : true,
    scaleLabel : "<%=value%>",
    scaleFontFamily : "'Arial'",
    scaleFontSize : 12,
    scaleFontStyle : "normal",
    scaleFontColor : "#666",
    scaleShowGridLines : true,
    scaleGridLineColor : "rgba(0,0,0,.05)",
    scaleGridLineWidth : 1, 
    bezierCurve : true,
    pointDot : true,
    pointDotRadius : 3,
    pointDotStrokeWidth : 1,
    datasetStroke : true,
    datasetStrokeWidth : 2,
    datasetFill : false,
    animation : false
};
options_percentage = {
    scaleOverlay : false,

    scaleOverride : true,
    scaleSteps : 10,
    scaleStepWidth : 10,
    scaleStartValue : 0,
    scaleLineColor : "rgba(0,0,0,.1)",
    scaleLineWidth : 1,
    scaleShowLabels : true,
    scaleLabel : "<%=value%>",
    scaleFontFamily : "'Arial'",
    scaleFontSize : 12,
    scaleFontStyle : "normal",
    scaleFontColor : "#666",
    scaleShowGridLines : true,
    scaleGridLineColor : "rgba(0,0,0,.05)",
    scaleGridLineWidth : 1, 
    bezierCurve : true,
    pointDot : true,
    pointDotRadius : 3,
    pointDotStrokeWidth : 1,
    datasetStroke : true,
    datasetStrokeWidth : 2,
    datasetFill : false,
    animation : false
};
// end chart options

/*
 * Variables
 */
var servers = []; // Keep all the current servers
var url = "";
var to_draw_array = [];
var timeouts = null;
var failed = false;
var labels = new Array(N);
for (var i = 0; i < N; i++) {labels[i] = i;};

/*
 * Functions
 */

function conexionError() {
    $("#cantconnect").show();
    failed = true;
}

function conexionOK() {
    if (failed === true) {
        $("#cantconnect").hide();
        failed = false;
    }
}

/*
 * Stop all timeouts.
 */
function clear_all_timeouts() {
    if (timeouts === null) {
        console.log("[-] Impossible to clear undefined timeouts.");
        return;
    }
    
    $.each(timeouts.getAll(), function(i, timeout) {
        clearTimeout(timeout);
    });
}

/*
 * Redirect to "main" page.
 */
function clear_main_stage() {
    location.assign(window.location.href.split("#")[0]);
}

/*
 * Add a server so servers[]
 * @param name  Server's name.
 * @param url   Url to fetch json from.
 * @param json  First json request (to setup charts).
 * @return      Id of the added server in servers[].
 */
function add_server(name, url, json) {
    server = new Object();
    server.url = url;
    server.name = name;
    id = servers.length;
    timeouts = new ringBuffer(add_server_charts(json));
    server.base_json = json;
    gen_nav_server_entry(server.name, id);
    add_active_nav_server(id);
    add_nav_server_pause();
    servers.push(server);
    return id;
}

/*
 * Add class attribute to "active" for a server in the navigation bar.
 * @param id    The server's id.
 */
function add_active_nav_server(id) {
    $("#nav_server_item"+id).addClass("active");
}

/*
 * Remove class attribute to "active" for all servers in the navigation bar.
 */
function remove_active_nav_server() {
    $("#nav_server_list .active").attr("class", "");
}

/*
 * Add the pause link to a server in the navigation bar.
 * @param id    The server's id.
 */
function add_nav_server_pause() {
    $("#nav_server_list .active a").prepend('<span onclick="pause_all_timeouts('+id+');" id="pause_timeouts'+id+'" class="glyphicon glyphicon-pause"></span>');
}

/*
 * Remove the pause button
 */
function remove_nav_server_pause() {
    $("#nav_server_list .active a .glyphicon-pause,#nav_server_list .active a .glyphicon-play").remove();
}

/*
 * Add the server link in the navigation bar.
 * @param name  The name to display.
 * @param id    The server's id.
 */
function gen_nav_server_entry(name, id) {
    $("#nav_server_list").append('<li id="nav_server_item'+id+'"><a href="#'+id+'"><span onclick="switch_server('+id+');">'+name+'</span> ' + '<span onclick="remove_server('+id+');" class="glyphicon glyphicon-remove"></a></li>');
}

/*
 * Pause "fetching" timers.
 * @param span_id   The server's id.
 */
function pause_all_timeouts(span_id) {
    span_id = "#pause_timeouts" + span_id;
    if ($(span_id).hasClass("glyphicon-pause")) {
        clear_all_timeouts();
        $(span_id).removeClass("glyphicon-pause");
        $(span_id).addClass("glyphicon-play");
    } else {
        $(span_id).removeClass("glyphicon-play");
        $(span_id).addClass("glyphicon-pause");
        redrawCharts();
    }
}

/*
 * Remove a server and redirect on the "main" page.
 */
function remove_server(server_id) {
    console.log("server_id = "); console.log(server_id);
    delete servers[server_id];
    // Siwtch to first item if not the one we try to remove
    id_first = parseInt($("#nav_server_list li:first a").attr("href").split("#")[1]);
    $("#nav_server_list .active").remove();
    if (id_first === server_id) {
        console.log("in");
        location.assign(window.location.href.split("#")[0]);
    } else {
        switch_server(id_first);
        redrawCharts();
    }
}

/*
 * Logic to switch of server.
 * @param server_id    The server's id.
 */
function switch_server(server_id) {
    remove_nav_server_pause();
    remove_active_nav_server();
    clear_all_timeouts();
    $("#main-stage").html('<span class="glyphicon glyphicon-refresh"></span>');
    url = servers[server_id].url;
    timeouts = new ringBuffer(add_server_charts(servers[server_id].base_json));
    add_active_nav_server(server_id);
    add_nav_server_pause();
    location.assign(window.location.href.split("#")[0] + "#" + server_id);
}

/*
 * Draw the data in the chart by calling new Chart().
 * @param id_chart  The id of <canvas> for the chart.
 * @param data      Array of integer/real values to draw.
 * @param opt       "%" for a percentage chart.
 */
function draw_chart(id_chart, data, opt) {
    data_sets = [];

    $.each(data, function(index, val) {
        tmp = new Object();
        tmp.strokeColor = colors[index];
        tmp.pointColor = colors[index];
        tmp.pointStrokeColor = "#fff";
        tmp.data = val.getAll();
        data_sets.push(tmp);
    });

    m_data = {labels: labels, datasets: data_sets };

    var ctx = document.getElementById(id_chart).getContext("2d");
    if (opt === "%")
        new Chart(ctx).Line(m_data, options_percentage);
    else
        new Chart(ctx).Line(m_data, options);
}

/*
 * Create a html string ready to be included in the html page.
 * @param chart_name    The id / name of the chart.
 * @param width         Width of the chart.
 * @param height        Height of the chart.
 * @param unit          Unity of the dataset.
 * @param special_name  TODO
 * @param def           TODO
 * @return              A html string.
 */
function html_chart(chart_name, width, height, unit, special_name) {
    width = typeof width !== 'undefined' ? width : 500;
    height = typeof height !== 'undefined' ? height : 300;
    unit = typeof unit !== 'undefined' ? " <i>(" + unit + ")</i>" : "";
    special_name = typeof special_name !== 'undefined' ? "<b>" + special_name + "</b> " : "";
    
    str = "";
    panel_start = '<div class="col-md-6"><div class="panel panel-default">\n\t<div class="panel-heading">';
    panel_middle = '</div>\n\t<div class="panel-body">';
    panel_end = '\t</div>\n</div></div>';
    str += panel_start + special_name + chart_name + unit + panel_middle + "<canvas id=\"" + chart_name;
    str += "\" width=\"" + width + "\" height=\"" + height + "\"></canvas>" + panel_end; 
    
    return str;
}

/*
 * Retry to connect to 'url' i times :
 *   If it fails, retry in 2 seconds,
 *   Else, the request succeed and return -1
 * @param i     Number of times to retry connection.
 */
function retry_connect(i) {
    if (i > 0) {
        setTimeout(function() { $.ajax({async: false, dataType: "json", url: url, crossDomain: true,
                                    success: function(json_data) { failed = false; },
                                    fail: function() { failed = true; }});
                               
                               if (failed === false)
                                   return -1;
                               retry_connect(i-1);
                              }, 2000);
    }
}

/*
 * Creates a color rectangle (yet to fill) with a label.
 * @param chart_name    Id of the target chart.
 * @param text          Label text to display.
 * @param val           The label number [1.. colors.length()]
 */
function color_labels(chart_name, text, val) {
    $('<canvas width="30" height="20" id="color_label" val="'+val
        +'"></canvas><span>'+text+'</span>').insertBefore('#'+chart_name);;
}

/*
 * Set the appropriate color rectangle for each chart color label.
 */
function colorize_labels() {
    $.each($("div #color_label"), function(i, obj) {
            ctx = obj.getContext("2d");
            ctx.fillStyle = colors[obj.getAttribute("val")-1];
            ctx.fillRect(5,8,20,20);
        });
}

/*
 * Create the canvas needed by chart.js from json.
 */
function add_server_charts(json) {
    nb_charts = 0;

    str_panel = "";
    $("#main_stage").html("");

    cpu = json.cpu  ;
    if (cpu !== undefined) {
        nb_charts++;
        str_panel = html_chart("cpu", undefined, undefined, "%", undefined);
        rb = new ringBuffer(N);
        rb.push(cpu);
        to_draw_array.push({name: "cpu", data: rb});
        $("#main_stage").append(str_panel);
    }
    
    load = json.load;
    if (load !== undefined) {
        nb_charts++;
        str = "";
        $.each(load, function(index, val) {
             str += val + " ";
        });
        str_panel = html_chart("load", undefined, undefined, undefined, undefined);
        to_draw_array.push({name: "load", data: ringBuffers_from_json(load)});
        $("#main_stage").append(str_panel);
        color_labels("load", "last min", 1);
        color_labels("load", "last 5 min", 2);
        color_labels("load", "last 15 min", 3);
    }

    mem = json.mem;
    if (mem !== undefined) {
        nb_charts++;
        str_panel = html_chart("mem", undefined, undefined, "%", undefined);
        rb = new ringBuffer(N);
        rb.push(mem);
        to_draw_array.push({name: "mem", data: rb});
        $("#main_stage").append(str_panel);
    }

    disks = json.disk;
    if(disks !== undefined) {
        $.each(disks, function(i, disk) {
            nb_charts++;
            str_panel = html_chart(disk.name, undefined, undefined, undefined, "disk");
            to_draw_array.push({class: "disk", name: disk.name, data: ringBuffers_from_json(disk.data)});
            $("#main_stage").append(str_panel);
            color_labels(disk.name, "# reads", 1);
            color_labels(disk.name, "# writes", 2);
            color_labels(disk.name, "# milliseconds spent reading", 3);
            color_labels(disk.name, "# milliseconds spent writing", 4);
        });
    }

    net = json.net;
    if(net !== undefined) {
        $.each(net, function(index, net_interface) {
            nb_charts++;
            str_panel = html_chart(net_interface.name, undefined, undefined, "bytes per second", "net");
            to_draw_array.push({class: "net", name: net_interface.name, data: ringBuffers_from_json(net_interface.data)});
            $("#main_stage").append(str_panel);
            color_labels(net_interface.name, "in", 1);
            color_labels(net_interface.name, "out", 2);
        });
    }

    $("#cantconnect").hide();
    colorize_labels();
    
    return nb_charts;
}

/*
 * Update charts (and ringBuffers) with new values extracted
 * from json_data. Reset the delay to execute redrawCharts() in 'delay'.
 * @param json_data     Whole JSON as received.
 */
function parse_json(json_data) {
    $.each(to_draw_array, function(i, content) {
                        
        if (content.name == "load") {
            $.each(content.data, function(index, val) {
                val.push(json_data.load[index]);
            });
            draw_chart(content.name, content.data, null);
            
        } else if (content.name == "mem") {
            (content.data).push(json_data.mem);
            draw_chart(content.name, [content.data], "%");
            
        } else if (content.name == "cpu") {
            (content.data).push(json_data.cpu);
            draw_chart(content.name, [content.data], "%");
            
        } else if (content.class == "disk") {
            $.each(json_data.disk, function(index, disk) {
                if (disk.name === content.name) {
                    $.each(disk.data, function(j, rb) {
                        (content.data[j]).push(json_data.disk[index].data[j]);
                    });
                }
                draw_chart(content.name, content.data, null);
            });
            
        } else if (content.class == "net") {
            $.each(json_data.net, function(index, net_interface) {
                if (net_interface.name === content.name) {
                    $.each(net_interface.data, function(j, rb) {
                        (content.data[j]).push(json_data.net[index].data[j]);
                    });
                }
                draw_chart(content.name, content.data, null);
            });
            
        } else {
            console.log("[-] unknow content:");
            console.log(content);
        }
    });
    timeouts.tab[i] = setTimeout(redrawCharts, delay);
    conexionOK();
}

/*
 * AJAX call to var 'url'.
 * On sucess execute parse_json().
 * On error execute conexionError().
 */
function redrawCharts() {
    $.ajax({async: false,
            dataType: "json",
            url: url,
            crossDomain: true,
            success: parse_json,
            fail: conexionError()
        });
}

/*
 * Link buttons to actions
 */

// We clear everything in the modal as soon as it's called
$("#add_server_modal").on('show.bs.modal', function () {
    document.activeElement.blur();
    $("#add_server_url").focus();
    $("#add_server_alerts_area").text('');
    footer = $("#add_server_modal_btn_ok").parent();
    footer.text('');
    footer.append('<button id="add_server_modal_btn" type="button" class="btn btn-default">try to connect</button>');
    $("#add_server_url").val('');
    $("#add_server_name").val('');
    
    /*
     * Modal operations
     */
    $("#add_server_modal_btn").click(function() {
        url = $("#add_server_url").val();
        if (url == "") {
            $("#add_server_alerts_area").append('<div class="alert alert-danger">Provide a correct url for the server.</div>');
        } else {
            $("#add_server_alerts_area").text('');
            if (! url.match("^http"))
                url = $("#add_server_url_proto").text() + url;
        }
    
        var servername = $("#add_server_name").val();
        if (servername === "") {
            servername = "server" + (servers.length + 1);
            $("#add_server_name").val(servername);
        } 
    
        // Let's check that we don't add an existing url / name to the server list
        existing_url = false; i = 0; existing_name = false;
        while (!existing_url && !existing_name && i < servers.length) {
            if (servers[i].url == url) {existing_url = true;}
            if (servers[i].name == servername) {existing_name = true;}
            i++;
        }
    
        if (existing_url) {
            $("#add_server_alerts_area").append('<div class="alert alert-danger">This server url is already in use, please choose another one.</div>');
        } else if (existing_name) {
            $("#add_server_alerts_area").append('<div class="alert alert-danger">This server name is already in use, please choose another name.</div>');
        } else {
            // Let's try to connect with the informations
            $.getJSON(url)
            .done(function(data) {
                // We won't handle modification now
                $("#add_server_name").attr("disabled", true);
                $("#add_server_url").attr("disabled", true);
    
                footer = $("#add_server_modal_btn").parent();
                footer.text('');
                footer.append('<button id="add_server_modal_btn_ok" type="button" data-dismiss="modal" class="btn btn-success">add server</button>');
                
                $("#add_server_modal_btn_ok").click(function() {
                    $("#add_server_modal").hide();
                    switch_server(add_server(servername, url, data));
                    redrawCharts();
                });
                
                $("#add_server_alerts_area").text('');
    
                $("#add_server_name").attr("disabled", false);
                $("#add_server_url").attr("disabled", false);
            })
            .fail(function(){
                $("#add_server_alerts_area").text('');
                $("#add_server_alerts_area").append('<div class="alert alert-danger">Couldn\'t connect to the supplied URL.</div>');
            });
        }
    
    });
});


// Press the button on modal when "Enter" is pressed in one of the
// two input fields
$("#add_server_url,#add_server_name").keypress(function(e) {
   code = (e.keyCode ? e.keyCode : e.which);
        if (code === 10 || code === 13) {
            a = $("#add_server_modal_btn");
            if (a.length > 0)
                a.click();
            else
                $("#add_server_modal_btn_ok").click();
        }
});

// Try to reconnect button in alert area
$("#cantconnect-retry").on("click", function() {
    $("#cantconnect").hide();
    
    if (failed === true) {
        // Reconnection failed, removing the server is the only option now
        $("#cantconnect-retry").hide();
        $("#cantconnect").show();
    } else {
        // The connection is back
        redrawCharts();
    }
});

// Remove server button in alert area
$("#cantconnect-remove").on("click", function() {
    remove_server(parseInt(window.location.href.split("#")[1]));
});


/*
 * Main program
 */
loc = window.location.href.split("#");
if (loc[1] !== undefined)
    location.assign(loc[0]);

$("#main_stage").show();
$("#main_stage").html('<h1>Hello World!</h1>');
$("#main_stage").append('<p>You have no servers added yet, add one by clicking "add a server" in the navigation bar.</p>');
