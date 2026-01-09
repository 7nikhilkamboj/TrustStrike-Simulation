// Phishlets Management
var phishlets = [];
var currentProxyHostIndex = 0;
var currentAuthTokenIndex = 0;
const API_BASE = "/api/phishlets";

// Load phishlets on page load
$(document).ready(function () {
    loadPhishlets();

    // Search functionality
    $("#searchPhishlets").on("keyup", function () {
        var value = $(this).val().toLowerCase();
        $("#phishletsTableBody tr").filter(function () {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1);
        });
    });
});

// Load all phishlets
function loadPhishlets() {
    $.ajax({
        url: API_BASE,
        method: "GET",
        success: function (data) {
            console.log("Loaded phishlets:", data);
            if (Array.isArray(data)) {
                phishlets = data;
            } else if (data && Array.isArray(data.phishlets)) {
                phishlets = data.phishlets;
            } else {
                phishlets = [];
                console.error("Unexpected phishlets data format:", data);
            }
            renderPhishletsList();
        },
        error: function (xhr) {
            showError("Failed to load phishlets: " + (xhr.responseJSON?.error || "Unknown error"));
        }
    });
}

// Render phishlets list
function renderPhishletsList() {
    var tbody = $("#phishletsTableBody");
    tbody.empty();

    if (phishlets.length === 0) {
        tbody.append('<tr><td colspan="5" class="text-center">No phishlets found</td></tr>');
        return;
    }

    phishlets.forEach(function (phishletItem) {
        // Handle case where API returns just an array of strings (names)
        let isString = typeof phishletItem === 'string';
        let name = isString ? phishletItem : (phishletItem.name || '');
        let author = isString ? '-' : (phishletItem.author || '');
        let minVer = isString ? '-' : (phishletItem.min_ver || '');
        let landingDomain = isString ? '-' : (phishletItem.landing_domain || '-');

        console.log("Rendering phishlet:", name);

        let row = $('<tr>');
        let nameCell = $('<td>').text(name);
        let authorCell = $('<td>').text(author);
        let minVerCell = $('<td>').text(minVer);
        let landingCell = $('<td>').text(landingDomain);

        row.append(nameCell);
        row.append(authorCell);
        row.append(minVerCell);
        row.append(landingCell);

        // If we only have the name, fetch the full config asynchronously
        if (isString) {
            $.ajax({
                url: API_BASE + "/" + name + "/config",
                method: "GET",
                success: function (config) {
                    authorCell.text(config.author || '-');
                    minVerCell.text(config.min_ver || '-');
                    landingCell.text(config.landing_domain || '-');
                }
            });
        }

        let actions = $('<td>');
        actions.append(
            $('<button>').addClass('btn btn-sm btn-info').html('<i class="fa fa-eye"></i> View Config')
                .click(function () {
                    viewConfig(name);
                }),
            ' ',
            $('<button>').addClass('btn btn-sm btn-primary').html('<i class="fa fa-edit"></i> Edit')
                .click(function () {
                    editPhishlet(name);
                }),
            ' ',
            $('<button>').addClass('btn btn-sm btn-success').html('<i class="fa fa-check"></i> Validate')
                .click(function () {
                    validatePhishlet(name);
                }),
            ' ',
            $('<button>').addClass('btn btn-sm btn-danger').html('<i class="fa fa-trash"></i>')
                .click(function () { deletePhishlet(name); })
        );
        row.append(actions);
        tbody.append(row);
    });
}

// Create new phishlet
function savePhishlet() {
    var mode = $("#phishletEditMode").val();
    var name = $("#phishletName").val().trim();

    if (!name) {
        showError("Phishlet name is required");
        return;
    }

    // Build phishlet object
    var phishletData = {
        name: name,
        author: $("#phishletAuthor").val().trim(),
        min_ver: $("#phishletMinVer").val().trim() || "3.3.0",
        landing_domain: $("#phishletLandingDomain").val().trim(),
        login: {
            domain: $("#loginDomain").val().trim(),
            path: $("#loginPath").val().trim() || "/"
        }
    };

    // Add proxy hosts
    var proxyHosts = [];
    $(".proxy-host-item").each(function () {
        var item = $(this);
        proxyHosts.push({
            phish_sub: item.find(".proxy-phish-sub").val().trim(),
            orig_sub: item.find(".proxy-orig-sub").val().trim(),
            domain: item.find(".proxy-domain").val().trim(),
            session: item.find(".proxy-session").is(":checked"),
            is_landing: item.find(".proxy-is-landing").is(":checked")
        });
    });
    if (proxyHosts.length > 0) {
        phishletData.proxy_hosts = proxyHosts;
    }

    // Add auth tokens
    var authTokens = [];
    $(".auth-token-item").each(function () {
        var item = $(this);
        var keys = item.find(".auth-keys").val().split(',').map(k => k.trim()).filter(k => k);
        authTokens.push({
            domain: item.find(".auth-domain").val().trim(),
            keys: keys
        });
    });
    if (authTokens.length > 0) {
        phishletData.auth_tokens = authTokens;
    }

    // Add credentials
    var credentials = {};
    var usernameKey = $("#credUsernameKey").val().trim();
    var passwordKey = $("#credPasswordKey").val().trim();

    if (usernameKey) {
        credentials.username = {
            key: usernameKey,
            search: $("#credUsernameSearch").val() || "(.*)",
            type: $("#credUsernameType").val()
        };
    }
    if (passwordKey) {
        credentials.password = {
            key: passwordKey,
            search: $("#credPasswordSearch").val() || "(.*)",
            type: $("#credPasswordType").val()
        };
    }
    if (Object.keys(credentials).length > 0) {
        phishletData.credentials = credentials;
    }

    // API call
    var url = API_BASE;
    var method = "POST";

    if (mode === "edit") {
        url += "/" + name;
        method = "PUT";
    }

    $.ajax({
        url: url,
        method: method,
        contentType: "application/json",
        data: JSON.stringify(phishletData),
        success: function () {
            showSuccess("Phishlet " + (mode === "edit" ? "updated" : "created") + " successfully");
            $("#createPhishletModal").modal("hide");
            resetPhishletForm();
            loadPhishlets();
        },
        error: function (xhr) {
            showError("Failed to save phishlet: " + (xhr.responseJSON?.error || "Unknown error"));
        }
    });
}

// Edit phishlet
function editPhishlet(name) {
    $.ajax({
        url: API_BASE + "/" + name + "/config",
        method: "GET",
        success: function (data) {
            populatePhishletForm(data);
            $("#phishletEditMode").val("edit");
            $("#phishletModalTitle").text("Edit Phishlet: " + name);
            $("#phishletName").prop("readonly", true);
            $("#createPhishletModal").modal("show");
        },
        error: function (xhr) {
            showError("Failed to load phishlet: " + (xhr.responseJSON?.error || "Unknown error"));
        }
    });
}

// Populate form with phishlet data
function populatePhishletForm(data) {
    $("#phishletName").val(data.name || '');
    $("#phishletAuthor").val(data.author || '');
    $("#phishletMinVer").val(data.min_ver || '3.3.0');
    $("#phishletLandingDomain").val(data.landing_domain || '');
    $("#loginDomain").val(data.login?.domain || '');
    $("#loginPath").val(data.login?.path || '/');

    // Proxy hosts
    $("#proxyHostsList").empty();
    if (data.proxy_hosts) {
        data.proxy_hosts.forEach(function (host) {
            addProxyHost(host);
        });
    }

    // Auth tokens
    $("#authTokensList").empty();
    if (data.auth_tokens) {
        data.auth_tokens.forEach(function (token) {
            addAuthToken(token);
        });
    }

    // Credentials
    if (data.credentials) {
        if (data.credentials.username) {
            $("#credUsernameKey").val(data.credentials.username.key || '');
            $("#credUsernameSearch").val(data.credentials.username.search || '(.*)');
            $("#credUsernameType").val(data.credentials.username.type || 'post');
        }
        if (data.credentials.password) {
            $("#credPasswordKey").val(data.credentials.password.key || '');
            $("#credPasswordSearch").val(data.credentials.password.search || '(.*)');
            $("#credPasswordType").val(data.credentials.password.type || 'post');
        }
    }
}

// Add proxy host row
function addProxyHost(data) {
    data = data || {};
    var index = currentProxyHostIndex++;
    var html = `
        <div class="panel panel-default proxy-host-item" style="margin-bottom: 10px;">
            <div class="panel-body">
                <button type="button" class="btn btn-xs btn-danger pull-right" onclick="$(this).closest('.proxy-host-item').remove()">
                    <i class="fa fa-trash"></i>
                </button>
                <div class="row">
                    <div class="col-md-3">
                        <div class="form-group">
                            <label>Phish Subdomain</label>
                            <input type="text" class="form-control proxy-phish-sub" value="${data.phish_sub || ''}" placeholder="login">
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="form-group">
                            <label>Original Subdomain</label>
                            <input type="text" class="form-control proxy-orig-sub" value="${data.orig_sub || ''}" placeholder="login">
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="form-group">
                            <label>Domain</label>
                            <input type="text" class="form-control proxy-domain" value="${data.domain || ''}" placeholder="example.com">
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" class="proxy-session" ${data.session ? 'checked' : ''}> Session
                            </label>
                        </div>
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" class="proxy-is-landing" ${data.is_landing ? 'checked' : ''}> Is Landing
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    $("#proxyHostsList").append(html);
}

// Add auth token row
function addAuthToken(data) {
    data = data || {};
    var index = currentAuthTokenIndex++;
    var html = `
        <div class="panel panel-default auth-token-item" style="margin-bottom: 10px;">
            <div class="panel-body">
                <button type="button" class="btn btn-xs btn-danger pull-right" onclick="$(this).closest('.auth-token-item').remove()">
                    <i class="fa fa-trash"></i>
                </button>
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Domain</label>
                            <input type="text" class="form-control auth-domain" value="${data.domain || ''}" placeholder=".example.com">
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Keys (comma-separated)</label>
                            <input type="text" class="form-control auth-keys" value="${data.keys ? data.keys.join(', ') : ''}" placeholder="session_token, auth_cookie">
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    $("#authTokensList").append(html);
}

// View phishlet configuration
function viewConfig(name) {
    $.ajax({
        url: API_BASE + "/" + name + "/config",
        method: "GET",
        success: function (data) {
            $("#configDisplay").text(JSON.stringify(data, null, 2));
            $("#viewConfigModal").modal("show");
        },
        error: function (xhr) {
            showError("Failed to load configuration: " + (xhr.responseJSON?.error || "Unknown error"));
        }
    });
}

// Validate phishlet
function validatePhishlet(name) {
    $.ajax({
        url: API_BASE + "/" + name + "/validate",
        method: "POST",
        success: function (data) {
            if (data.valid) {
                showSuccess("Phishlet '" + name + "' is valid!");
            } else {
                showError("Phishlet validation failed: " + (data.errors ? data.errors.join(", ") : "Unknown error"));
            }
        },
        error: function (xhr) {
            showError("Failed to validate phishlet: " + (xhr.responseJSON?.error || "Unknown error"));
        }
    });
}

// Delete phishlet
function deletePhishlet(name) {
    if (!confirm("Are you sure you want to delete the phishlet '" + name + "'?")) {
        return;
    }

    $.ajax({
        url: API_BASE + "/" + name,
        method: "DELETE",
        success: function () {
            showSuccess("Phishlet deleted successfully");
            loadPhishlets();
        },
        error: function (xhr) {
            showError("Failed to delete phishlet: " + (xhr.responseJSON?.error || "Unknown error"));
        }
    });
}

// Reset form
function resetPhishletForm() {
    $("#phishletForm")[0].reset();
    $("#phishletEditMode").val("create");
    $("#phishletModalTitle").text("Create New Phishlet");
    $("#phishletName").prop("readonly", false);
    $("#proxyHostsList").empty();
    $("#authTokensList").empty();
    currentProxyHostIndex = 0;
    currentAuthTokenIndex = 0;
}

// Show success message
function showSuccess(message) {
    Swal.fire({
        icon: 'success',
        title: 'Success',
        text: message,
        timer: 3000
    });
}

// Show error message
function showError(message) {
    Swal.fire({
        icon: 'error',
        title: 'Error',
        text: message
    });
}

// Reset form when modal closes
$("#createPhishletModal").on("hidden.bs.modal", function () {
    resetPhishletForm();
});
