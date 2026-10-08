package com.geopetro.desktop.monitoramento;

import javafx.scene.Node;
import javafx.scene.Group;
import javafx.scene.Cursor;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.Tooltip;
import javafx.scene.layout.Pane;
import javafx.scene.layout.Region;
import javafx.scene.layout.StackPane;
import javafx.scene.transform.Scale;
import java.util.LinkedHashMap;
import java.util.Map;

/** Eight columns by four rows. Positions use cells, never screen pixels. */
public class DashboardGrid extends Pane {
    private record Slot(int x, int y, int w, int h) {
        boolean overlaps(Slot b) { return x < b.x+b.w && x+w > b.x && y < b.y+b.h && y+h > b.y; }
    }
    private final Map<Node, String> keys = new LinkedHashMap<>();
    private final Map<Node, Slot> slots = new LinkedHashMap<>();
    private int page;
    public int pageCount() { return slots.values().stream().mapToInt(s -> s.y / 4 + 1).max().orElse(1); }
    public int page() { return page; }
    public void showPage(int value) { page = Math.max(0, Math.min(pageCount()-1,value)); requestLayout(); }
    private final Map<String, Slot> saved = new LinkedHashMap<>();
    private final java.nio.file.Path FILE;
    private void loadLayout() {
        var p = new java.util.Properties();
        if (java.nio.file.Files.isRegularFile(FILE)) try (var in = java.nio.file.Files.newInputStream(FILE)) {
            p.load(in);
            for (String key : p.stringPropertyNames()) {
                try {
                    String[] v = p.getProperty(key).split(",");
                    saved.put(key, new Slot(Integer.parseInt(v[0]), Integer.parseInt(v[1]), Integer.parseInt(v[2]), Integer.parseInt(v[3])));
                } catch (RuntimeException ignored) { /* Ignore a damaged entry only. */ }
            }
        } catch (java.io.IOException e) { org.slf4j.LoggerFactory.getLogger(DashboardGrid.class).warn("Falha ao ler layout", e); }
    }
    private final boolean persist;
    public DashboardGrid() { this(true); }
    DashboardGrid(boolean persist) {
        this(com.geopetro.desktop.comum.AppPaths.configDir().resolve("dashboard-layout.properties"), persist);
    }
    DashboardGrid(java.nio.file.Path file, boolean persist) {
        this.FILE = file; this.persist = persist; setMinSize(0, 0); loadLayout();
    }
    public void clearCards() { slots.clear(); keys.clear(); getChildren().clear(); }
    private boolean fits(Node except, Slot s) {
        return s.x >= 0 && s.y >= 0 && s.w > 0 && s.h > 0 && s.x+s.w <= 8 && s.y%4+s.h <= 4
            && slots.entrySet().stream().noneMatch(e -> e.getKey() != except && e.getValue().overlaps(s));
    }
    public boolean addCard(String key, Region content, int width) {
        Slot slot = saved.get(key);
        if (slot == null || !fits(null, slot)) {
            slot = null;
            for (int y = 0; y <= slots.size()*4+4 && slot == null; y++) for (int x = 0; x <= 8-width; x++) {
                var candidate = new Slot(x, y, width, 2);
                if (fits(null, candidate)) { slot = candidate; break; }
            }
        }
        if (slot == null) return false;
        content.setMinSize(0, 0);
        content.setMaxSize(Double.MAX_VALUE, Double.MAX_VALUE);
        var grip = new Label("◢");
        grip.setStyle("-fx-text-fill: #8393aa; -fx-padding: 2;");
        grip.setCursor(Cursor.SE_RESIZE);
        Tooltip.install(grip, new Tooltip("Arraste para redimensionar"));
        StackPane frame = new StackPane() {
            @Override protected void layoutChildren() {
                content.resizeRelocate(2, 2, Math.max(0,getWidth()-4), Math.max(0,getHeight()-4));
                grip.resizeRelocate(Math.max(0,getWidth()-20), Math.max(0,getHeight()-20), 20, 20);
            }
        };
        frame.setMinSize(0, 0);
        frame.getStyleClass().add("card-grandeza");
        content.getStyleClass().remove("card-grandeza");
        // Alarm borders belong to the actual tile, including after resizing.
        content.getStyleClass().addListener((javafx.collections.ListChangeListener<String>) c -> {
            frame.getStyleClass().removeAll("card-grandeza-atencao", "card-grandeza-critico");
            for (String style : content.getStyleClass()) if (style.startsWith("card-grandeza-")) frame.getStyleClass().add(style);
        });
        frame.getChildren().addAll(content, grip);
        frame.setCursor(Cursor.MOVE);
        Tooltip.install(frame, new Tooltip("Arraste o card para reposicionar na grade 8 × 4"));
        final double[] start = new double[2];
        final Slot[] origin = new Slot[1];
        final boolean[] resize = new boolean[1];
        final Slot[] destination = new Slot[1];
        frame.addEventFilter(javafx.scene.input.MouseEvent.MOUSE_PRESSED, e -> {
            Node target = e.getTarget() instanceof Node n ? n : null;
            for (Node n = target; n != null && n != frame; n = n.getParent()) if (n instanceof Button) return;
            if (!e.isPrimaryButtonDown()) return;
            start[0] = e.getSceneX(); start[1] = e.getSceneY(); origin[0] = slots.get(frame);
            destination[0] = origin[0];
            frame.setViewOrder(-1);
            frame.pseudoClassStateChanged(javafx.css.PseudoClass.getPseudoClass("dragging"),true);
            resize[0] = false;
            for (Node n = target; n != null && n != frame; n = n.getParent()) if (n == grip) resize[0] = true; e.consume();
        });
        frame.addEventFilter(javafx.scene.input.MouseEvent.MOUSE_DRAGGED, e -> {
            if (origin[0] == null) return;
            int dx = (int)Math.round((e.getSceneX()-start[0])/(getWidth()/8));
            int dy = (int)Math.round((e.getSceneY()-start[1])/(getHeight()/4));
            Slot o = origin[0];
            Slot next = resize[0] ? new Slot(o.x,o.y,o.w+dx,o.h+dy) : new Slot(o.x+dx,o.y+dy,o.w,o.h);
            destination[0] = next;
            if (resize[0]) {
                if (next.y / 4 == o.y / 4 && fits(frame,next)) { slots.put(frame,next); requestLayout(); }
            } else {
                frame.setTranslateX(e.getSceneX()-start[0]);
                frame.setTranslateY(e.getSceneY()-start[1]);
            }
            e.consume();
        });
        frame.addEventFilter(javafx.scene.input.MouseEvent.MOUSE_RELEASED, e -> {
            if (origin[0] == null) return;
            if (!resize[0]) {
                var pointer = sceneToLocal(e.getSceneX(), e.getSceneY());
                moveCard(frame, destination[0], pointer.getX(), pointer.getY());
            }
            frame.pseudoClassStateChanged(javafx.css.PseudoClass.getPseudoClass("dragging"),false);
            frame.setTranslateX(0); frame.setTranslateY(0); frame.setViewOrder(0);
            requestLayout();
            origin[0] = null;
            e.consume();
            if (!persist) return;
            slots.forEach((node, position) -> saved.put(keys.get(node), position));
            var p = new java.util.Properties();
            saved.forEach((k,s) -> p.setProperty(k,s.x+","+s.y+","+s.w+","+s.h));
            try {
                java.nio.file.Files.createDirectories(FILE.getParent());
                try (var out = java.nio.file.Files.newOutputStream(FILE)) { p.store(out,"Dashboard 8x4"); }
            } catch (java.io.IOException ex) { org.slf4j.LoggerFactory.getLogger(DashboardGrid.class).warn("Falha ao salvar layout",ex); }
            e.consume();
        });
        keys.put(frame, key); slots.put(frame, slot); getChildren().add(frame); return true;
    }
    /** Choose the destination from the pointer, regardless of where the card was grabbed. */
    private void moveCard(Node frame, Slot next, double pointerX, double pointerY) {
        Slot previous = slots.get(frame);
        if (pointerX < 0 || pointerY < 0 || pointerX >= getWidth() || pointerY >= getHeight()) return;
        int column = (int)(pointerX / (getWidth()/8));
        int row = page*4 + (int)(pointerY / (getHeight()/4));
        Node target = slots.entrySet().stream().filter(e -> e.getKey() != frame)
                .filter(e -> column >= e.getValue().x && column < e.getValue().x+e.getValue().w
                        && row >= e.getValue().y && row < e.getValue().y+e.getValue().h)
                .map(Map.Entry::getKey).findFirst().orElse(null);
        if (target == null) {
            if (next.y/4 == previous.y/4 && fits(frame,next)) slots.put(frame,next);
            return;
        }
        Slot occupied = slots.get(target);
        Slot anchored = new Slot(Math.min(occupied.x,8-previous.w),
                page*4+Math.min(occupied.y%4,4-previous.h),previous.w,previous.h);
        var others = new java.util.ArrayList<Node>();
        others.add(target);
        slots.forEach((node,slot) -> { if (node != frame && node != target && slot.y/4 == page) others.add(node); });
        var planned = new LinkedHashMap<Node,Slot>();
        planned.put(frame,anchored);
        // First try the exchanged origin, then nearby free cells. No sizes are changed.
        var preferred = new LinkedHashMap<Node,Slot>(slots);
        preferred.put(target,new Slot(previous.x,previous.y,occupied.w,occupied.h));
        if (place(others,0,mask(anchored),preferred,planned,new java.util.HashSet<>(),new int[]{50000})) {
            planned.forEach(slots::put);
        }
    }
    private long mask(Slot s) {
        long result=0;
        for (int y=s.y%4;y<s.y%4+s.h;y++) for (int x=s.x;x<s.x+s.w;x++) result |= 1L << (y*8+x);
        return result;
    }
    private boolean place(java.util.List<Node> nodes,int index,long used,Map<Node,Slot> preferred,
                          Map<Node,Slot> planned,java.util.Set<String> failed,int[] budget) {
        if (index == nodes.size()) return true;
        if (--budget[0] < 0) return false;
        String state=index+":"+used;
        if (failed.contains(state)) return false;
        Node node=nodes.get(index);
        Slot original=preferred.get(node);
        var candidates=new java.util.ArrayList<Slot>();
        candidates.add(original);
        for (int y=0;y<=4-original.h;y++) for(int x=0;x<=8-original.w;x++)
            candidates.add(new Slot(x,page*4+y,original.w,original.h));
        for (Slot candidate:candidates) {
            if (candidate.x<0 || candidate.x+candidate.w>8 || candidate.y%4+candidate.h>4) continue;
            long cells=mask(candidate);
            if ((used & cells) != 0) continue;
            planned.put(node,candidate);
            if (place(nodes,index+1,used|cells,preferred,planned,failed,budget)) return true;
            planned.remove(node);
        }
        failed.add(state);
        return false;
    }
    @Override protected void layoutChildren() {
        double gap = Math.min(12, Math.min(getWidth()/80, getHeight()/40));
        slots.forEach((node,s) -> { node.setVisible(s.y / 4 == page); node.resizeRelocate(s.x*getWidth()/8+gap/2, (s.y%4)*getHeight()/4+gap/2,
                Math.max(0,s.w*getWidth()/8-gap), Math.max(0,s.h*getHeight()/4-gap)); });
    }
}
