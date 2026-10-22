
// ==========================================
// GOURMET EXPRESS - SISTEMA DE VENTAS
// Base de datos local: IndexedDB + Dexie
// ==========================================

document.addEventListener("DOMContentLoaded", async function () {

    const PRECIOS = {
        pizza: 12.00,
        hamburguesa: 7.50,
        tacos: 8.50,
        sushi: 11.00,
        pequena: 1.00,
        mediana: 1.50,
        grande: 2.00,
        papas: 2.50,
        helado: 1.80,
        aros: 3.00
    };

    const PLATOS = {
        pizza: "Pizza Familiar",
        hamburguesa: "Hamburguesa Especial",
        tacos: "Tacos al Pastor",
        sushi: "Roll de Sushi Premium"
    };

    const BEBIDAS = {
        pequena: "Pequeña",
        mediana: "Mediana",
        grande: "Grande"
    };

    const formulario = document.getElementById("formularioRestaurante");
    const recibo = document.getElementById("reciboRespuesta");
    const historial = document.getElementById("tablaHistorial");
    const btnHistorial = document.getElementById("btnVerHistorial");
    const btnBorrar = document.getElementById("btnBorrarHistorial");
    const btnProcesar = document.getElementById("btnProcesar");

    let db = null;
    let baseLista = false;

    // ==========================================
    // FUNCIONES AUXILIARES
    // ==========================================

    function dinero(valor) {
        return "$" + Number(valor || 0).toFixed(2);
    }

    function escaparHTML(valor) {
        return String(valor ?? "").replace(/[&<>"']/g, function (caracter) {
            const mapa = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            };
            return mapa[caracter];
        });
    }

    function mostrarToast(mensaje, error = false) {
        const contenedor = document.getElementById("toastContainer");
        const toast = document.createElement("div");

        toast.className = error ? "toast error" : "toast";
        toast.textContent = mensaje;
        contenedor.appendChild(toast);

        setTimeout(() => toast.remove(), 3500);
    }

    function estadoBase(texto, correcto) {
        const elemento = document.getElementById("estadoDB");
        elemento.textContent = texto;
        elemento.style.color = correcto ? "#10b981" : "#ef4444";
    }

    // ==========================================
    // CONECTAR INDEXEDDB
    // ==========================================

    async function conectarBaseDatos() {
        try {
            if (typeof Dexie === "undefined") {
                throw new Error("No se cargó la biblioteca Dexie.js");
            }

            db = new Dexie("RestauranteGourmetDB");

            db.version(1).stores({
                pedidos: "++id, cliente, plato, bebida, extras, total, fecha"
            });

            await db.open();

            baseLista = true;
            estadoBase("● Conectada", true);

            console.log("✅ IndexedDB conectada correctamente");
            console.log("📁 Base: RestauranteGourmetDB");
            console.log("📋 Tabla: pedidos");

            await actualizarDashboard();

        } catch (error) {
            baseLista = false;
            estadoBase("● Error de conexión", false);
            console.error("Error IndexedDB:", error);
            mostrarToast("No se pudo conectar con IndexedDB", true);
        }
    }

    // ==========================================
    // CALCULAR TOTAL EN TIEMPO REAL
    // ==========================================

    function obtenerPedido() {
        const plato = document.getElementById("platoPrincipal").value;
        const bebidaSeleccionada = document.querySelector(
            'input[name="tamanoBebida"]:checked'
        );

        const bebida = bebidaSeleccionada
            ? bebidaSeleccionada.value
            : "pequena";

        const extras = [];

        if (document.getElementById("extraPapas").checked) {
            extras.push({ nombre: "Papas Fritas", precio: PRECIOS.papas });
        }

        if (document.getElementById("extraHelado").checked) {
            extras.push({ nombre: "Helado", precio: PRECIOS.helado });
        }

        if (document.getElementById("extraAros").checked) {
            extras.push({ nombre: "Aros de Cebolla", precio: PRECIOS.aros });
        }

        const totalExtras = extras.reduce(
            (suma, extra) => suma + extra.precio, 0
        );

        const total = Number((
            PRECIOS[plato] +
            PRECIOS[bebida] +
            totalExtras
        ).toFixed(2));

        return {
            plato,
            bebida,
            extras,
            total
        };
    }

    function calcularTotalActual() {
        const pedido = obtenerPedido();

        document.getElementById("liveTotalAmount").textContent =
            dinero(pedido.total);

        return pedido.total;
    }

    formulario.addEventListener("change", calcularTotalActual);
    formulario.addEventListener("input", calcularTotalActual);

    calcularTotalActual();

    // ==========================================
    // GUARDAR PEDIDO
    // ==========================================

    formulario.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (!baseLista) {
            mostrarToast("La base de datos no está disponible", true);
            return;
        }

        const inputCliente = document.getElementById("nombreCliente");
        const cliente = inputCliente.value.trim();

        if (!cliente) {
            mostrarToast("Ingresa el nombre del cliente", true);
            inputCliente.focus();
            return;
        }

        const pedido = obtenerPedido();

        const extrasTexto = pedido.extras.length
            ? pedido.extras.map(e => e.nombre).join(", ")
            : "Sin extras";

        const fecha = new Date().toLocaleString("es-GT");

        const nuevoPedido = {
            cliente: cliente,
            plato: PLATOS[pedido.plato],
            bebida: pedido.bebida,
            extras: extrasTexto,
            total: pedido.total,
            fecha: fecha
        };

        btnProcesar.disabled = true;
        btnProcesar.textContent = "⏳ Guardando pedido...";

        try {
            const id = await db.pedidos.add(nuevoPedido);

            console.log("✅ Pedido guardado en IndexedDB:", {
                id,
                ...nuevoPedido
            });

            mostrarRecibo(id, nuevoPedido, pedido);
            mostrarToast("✅ Pedido #" + id + " guardado correctamente");

            formulario.reset();
            calcularTotalActual();

            await actualizarDashboard();

            if (historial.style.display !== "none") {
                await cargarHistorial();
            }

        } catch (error) {
            console.error("Error al guardar pedido:", error);
            mostrarToast("Error al guardar el pedido", true);

        } finally {
            btnProcesar.disabled = false;
            btnProcesar.textContent = "🛒 Procesar y guardar pedido";
        }
    });

    // ==========================================
    // MOSTRAR RECIBO
    // ==========================================

    function mostrarRecibo(id, registro, pedido) {
        const extrasHTML = pedido.extras.length
            ? pedido.extras.map(extra => `
                <div>➕ ${escaparHTML(extra.nombre)}
                    — ${dinero(extra.precio)}</div>
              `).join("")
            : "<div>Sin extras</div>";

        recibo.innerHTML = `
            <div class="recibo-title">🧾 Recibo #${id}</div>
            <div>👤 <strong>Cliente:</strong> ${escaparHTML(registro.cliente)}</div>
            <div>📅 <strong>Fecha:</strong> ${escaparHTML(registro.fecha)}</div>
            <div>🍕 <strong>Plato:</strong> ${escaparHTML(registro.plato)}
                — ${dinero(PRECIOS[pedido.plato])}</div>
            <div>🥤 <strong>Bebida:</strong> ${escaparHTML(BEBIDAS[pedido.bebida])}
                — ${dinero(PRECIOS[pedido.bebida])}</div>
            ${extrasHTML}
            <div class="recibo-total">
                <span>TOTAL PAGADO</span>
                <strong>${dinero(registro.total)}</strong>
            </div>
        `;

        recibo.style.display = "block";
    }

    // ==========================================
    // ACTUALIZAR ESTADÍSTICAS
    // ==========================================

    async function actualizarDashboard() {
        if (!baseLista) return;

        try {
            const pedidos = await db.pedidos.toArray();

            const cantidad = pedidos.length;

            const total = pedidos.reduce(
                (suma, pedido) => suma + Number(pedido.total || 0), 0
            );

            const promedio = cantidad > 0 ? total / cantidad : 0;

            document.getElementById("ventasTotales").textContent =
                dinero(total);

            document.getElementById("cantidadPedidos").textContent =
                cantidad;

            document.getElementById("ticketPromedio").textContent =
                dinero(promedio);

        } catch (error) {
            console.error("Error al actualizar estadísticas:", error);
        }
    }

    // ==========================================
    // CONSULTAR HISTORIAL DE INDEXEDDB
    // ==========================================

    async function cargarHistorial() {
        if (!baseLista) {
            historial.innerHTML =
                '<div class="empty-state">Base de datos no disponible.</div>';
            return;
        }

        try {
            const pedidos = await db.pedidos
                .orderBy("id")
                .reverse()
                .toArray();

            console.log("📋 Historial leído desde IndexedDB:");
            console.table(pedidos);

            if (pedidos.length === 0) {
                historial.innerHTML = `
                    <div class="empty-state">
                        📭<br>
                        Todavía no hay pedidos registrados.<br>
                        Los nuevos pedidos aparecerán aquí.
                    </div>
                `;
                return;
            }

            const totalCaja = pedidos.reduce(
                (suma, pedido) => suma + Number(pedido.total || 0), 0
            );

            let html = `
                <div class="caja-total-badge">
                    💰 Total en caja: ${dinero(totalCaja)}
                </div>
            `;

            pedidos.forEach(pedido => {
                html += `
                    <div class="item-pedido">
                        <div class="pedido-header">
                            <strong>Pedido #${pedido.id}</strong>
                            <small>${escaparHTML(pedido.fecha)}</small>
                        </div>

                        <div>👤 <strong>Cliente:</strong>
                            ${escaparHTML(pedido.cliente)}</div>

                        <div>🍽️ <strong>Plato:</strong>
                            ${escaparHTML(pedido.plato)}</div>

                        <div>🥤 <strong>Bebida:</strong>
                            ${escaparHTML(BEBIDAS[pedido.bebida] || pedido.bebida)}</div>

                        <div>➕ <strong>Extras:</strong>
                            ${escaparHTML(pedido.extras)}</div>

                        <div class="pedido-total">
                            <span>Total pagado</span>
                            <strong>${dinero(pedido.total)}</strong>
                        </div>
                    </div>
                `;
            });

            historial.innerHTML = html;

        } catch (error) {
            console.error("Error al leer IndexedDB:", error);
            historial.innerHTML =
                '<div class="empty-state">❌ Error al cargar historial.</div>';
            mostrarToast("No se pudo cargar el historial", true);
        }
    }

    // ==========================================
    // BOTÓN MOSTRAR / OCULTAR HISTORIAL
    // ==========================================

    btnHistorial.addEventListener("click", async function () {
        const estaOculto =
            window.getComputedStyle(historial).display === "none";

        if (estaOculto) {
            historial.style.display = "block";
            btnHistorial.textContent = "🙈 Ocultar historial";
            await cargarHistorial();
        } else {
            historial.style.display = "none";
            btnHistorial.textContent = "📋 Mostrar historial";
        }
    });

    // ==========================================
    // BOTÓN BORRAR BASE DE DATOS
    // ==========================================

    btnBorrar.addEventListener("click", async function () {
        if (!baseLista) {
            mostrarToast("Base de datos no disponible", true);
            return;
        }

        const confirmar = window.confirm(
            "¿Estás seguro de eliminar TODOS los pedidos?\n\n" +
            "Esta acción no se puede deshacer."
        );

        if (!confirmar) return;

        btnBorrar.disabled = true;

        try {
            await db.pedidos.clear();

            console.log("🗑️ Todos los pedidos fueron eliminados");

            await actualizarDashboard();
            await cargarHistorial();

            mostrarToast("🗑️ Historial eliminado correctamente");

        } catch (error) {
            console.error("Error al borrar IndexedDB:", error);
            mostrarToast("Error al eliminar registros", true);

        } finally {
            btnBorrar.disabled = false;
        }
    });

    // ==========================================
    // INICIAR SISTEMA
    // ==========================================

    await conectarBaseDatos();

    console.log("🚀 Gourmet Express iniciado");
});
